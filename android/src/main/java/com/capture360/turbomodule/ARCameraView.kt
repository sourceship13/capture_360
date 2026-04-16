package com.bisetkaphotosphere.turbomodule

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.FrameLayout
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.tan

/**
 * ARCameraView — Android equivalent of the iOS ARCameraView.
 *
 * Uses CameraX for camera preview and ImageCapture for frame capture.
 * Uses Android SensorManager (GAME_ROTATION_VECTOR or ROTATION_VECTOR)
 * for orientation tracking, equivalent to ARKit world tracking.
 *
 * Sends orientation updates (~10 Hz) and captures frames with synchronized
 * rotation matrices and camera intrinsics for equirectangular stitching.
 */
class ARCameraView(context: Context) : FrameLayout(context), SensorEventListener {

    companion object {
        private const val TAG = "ARCameraView"
    }

    // ── Camera ───────────────────────────────────────────────────────────
    private val previewView = PreviewView(context)
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Sensor ───────────────────────────────────────────────────────────
    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val currentRotationMatrix = FloatArray(9).also {
        // Identity
        it[0] = 1f; it[4] = 1f; it[8] = 1f
    }
    private val sensorLock = Any()

    // ── Camera intrinsics ────────────────────────────────────────────────
    private var cameraHFovDeg = 65.0
    private var sensorFx = 0.0
    private var sensorFy = 0.0
    private var sensorCx = 0.0
    private var sensorCy = 0.0
    private var sensorImgW = 0.0
    private var sensorImgH = 0.0
    private var intrinsicsReady = false

    // ── State ────────────────────────────────────────────────────────────
    private val capturedFrames = mutableListOf<WritableMap>()
    private var sessionDir: String? = null
    private var frameIndex = 0
    private var lastOrientationSendMs = 0L
    private var cameraStarted = false

    // ── Props (set by ViewManager) ───────────────────────────────────────
    var isRecording: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            if (value) beginFrameCapture() else endFrameCapture()
        }

    init {
        // PERFORMANCE mode uses SurfaceView which has its own compositor surface,
        // bypassing the TextureView layout issue in React Native Fabric.
        previewView.implementationMode = PreviewView.ImplementationMode.PERFORMANCE
        addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    // React Native's Yoga layout engine calls layout() directly without triggering
    // Android's standard measure cycle. Override both requestLayout and onLayout to
    // force proper sizing of PreviewView and its internal SurfaceView.
    private val measureAndLayout = Runnable {
        measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        )
        layout(left, top, right, bottom)
    }

    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startSensors()
        startCamera()
    }

    override fun onDetachedFromWindow() {
        stopCamera()
        stopSensors()
        cameraExecutor.shutdown()
        super.onDetachedFromWindow()
    }

    // ── Sensor management ────────────────────────────────────────────────

    private fun startSensors() {
        rotationSensor?.let {
            sensorManager.registerListener(
                this, it, SensorManager.SENSOR_DELAY_GAME
            )
            Log.i(TAG, "Rotation sensor registered: ${it.name}")
        } ?: Log.w(TAG, "No rotation vector sensor available!")
    }

    private fun stopSensors() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_GAME_ROTATION_VECTOR &&
            event.sensor.type != Sensor.TYPE_ROTATION_VECTOR
        ) return

        val R = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(R, event.values)
        synchronized(sensorLock) {
            System.arraycopy(R, 0, currentRotationMatrix, 0, 9)
        }

        // Send orientation to JS at ~10 Hz
        val now = System.currentTimeMillis()
        if (now - lastOrientationSendMs >= 100) {
            lastOrientationSendMs = now
            sendOrientationUpdate(R)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /**
     * Convert Android ENU rotation matrix to yaw/pitch/roll in the
     * Y-up world convention used by the stitching code.
     *
     * Android sensor world: X=East, Y=North, Z=Up
     * Stitching world (Y-up): X=East, Y=Up, Z=North
     *
     * Camera axes (phone portrait):
     *   right   = device +X
     *   up      = device +Y
     *   forward = device -Z
     *
     * R maps device→ENU. Columns of R give device axes in ENU.
     *
     * Camera forward in ENU = R * [0,0,-1]^T = [-R[2], -R[5], -R[8]]
     *   → in Y-up: E→X, U→Y, N→Z = (-R[2], -R[8], -R[5])
     *
     * yaw   = atan2(fwd.X, fwd.Z)  = atan2(-R[2], -R[5])
     * pitch = asin(-fwd.Y)         = asin(R[8])
     */
    private fun sendOrientationUpdate(R: FloatArray) {
        val fwdX = -R[2].toDouble()
        val fwdY = -R[8].toDouble()
        val fwdZ = -R[5].toDouble()

        val yaw = Math.toDegrees(atan2(fwdX, fwdZ))
        val pitch = Math.toDegrees(asin((-fwdY).coerceIn(-1.0, 1.0)))

        val upE = R[1].toDouble()
        val upU = R[7].toDouble()
        val roll = Math.toDegrees(atan2(upE, upU))

        val event = Arguments.createMap().apply {
            putDouble("yaw", yaw)
            putDouble("pitch", pitch)
            putDouble("roll", roll)
            putInt("capturedCount", capturedFrames.size)
            putDouble("timestamp", System.currentTimeMillis() / 1000.0)
        }
        dispatchEvent("onOrientationUpdate", event)
    }

    // ── Camera management ────────────────────────────────────────────────

    @androidx.camera.camera2.interop.ExperimentalCamera2Interop
    private fun startCamera() {
        if (cameraStarted) return
        val ctx = context as? ReactContext ?: return
        val activity = ctx.currentActivity ?: return

        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "Camera permission not granted")
            return
        }

        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
        cameraProviderFuture.addListener({
            try {
                val provider = cameraProviderFuture.get()
                cameraProvider = provider

                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()

                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                provider.unbindAll()
                val camera = provider.bindToLifecycle(
                    activity as LifecycleOwner,
                    cameraSelector,
                    preview,
                    imageCapture
                )

                // Extract camera intrinsics from Camera2
                extractCameraIntrinsics(camera.cameraInfo)

                cameraStarted = true
                Log.i(TAG, "Camera started")
            } catch (e: Exception) {
                Log.e(TAG, "Camera start failed", e)
            }
        }, ContextCompat.getMainExecutor(ctx))
    }

    @androidx.camera.camera2.interop.ExperimentalCamera2Interop
    private fun extractCameraIntrinsics(cameraInfo: androidx.camera.core.CameraInfo) {
        try {
            val camera2Info = Camera2CameraInfo.from(cameraInfo)
            val cameraManager =
                context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val characteristics =
                cameraManager.getCameraCharacteristics(camera2Info.cameraId)

            val focalLengths = characteristics.get(
                CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS
            )
            val sensorSizeVal = characteristics.get(
                CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE
            )
            val pixelArraySize = characteristics.get(
                CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE
            )

            if (focalLengths != null && sensorSizeVal != null &&
                pixelArraySize != null && focalLengths.isNotEmpty()
            ) {
                val fl = focalLengths[0].toDouble()
                sensorFx = fl * pixelArraySize.width / sensorSizeVal.width
                sensorFy = fl * pixelArraySize.height / sensorSizeVal.height
                sensorCx = pixelArraySize.width / 2.0
                sensorCy = pixelArraySize.height / 2.0
                sensorImgW = pixelArraySize.width.toDouble()
                sensorImgH = pixelArraySize.height.toDouble()
                cameraHFovDeg = Math.toDegrees(
                    2.0 * atan(sensorSizeVal.width / (2.0 * fl))
                )
                intrinsicsReady = true
                Log.i(
                    TAG,
                    "Camera intrinsics: fx=%.1f fy=%.1f cx=%.1f cy=%.1f hFov=%.1f°"
                        .format(sensorFx, sensorFy, sensorCx, sensorCy, cameraHFovDeg)
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not extract camera intrinsics: ${e.message}")
        }
    }

    private fun stopCamera() {
        cameraProvider?.unbindAll()
        cameraStarted = false
        Log.i(TAG, "Camera stopped")
    }

    // ── Recording ────────────────────────────────────────────────────────

    private fun beginFrameCapture() {
        Log.i(TAG, "Frame capture started")
        capturedFrames.clear()
        frameIndex = 0

        sessionDir = File(
            context.filesDir,
            "photosphere_${UUID.randomUUID()}"
        ).also { it.mkdirs() }.absolutePath
    }

    private fun endFrameCapture() {
        val frames = Arguments.createArray()
        for (frame in capturedFrames) {
            frames.pushMap(frame)
        }

        Log.i(TAG, "Frame capture stopped – ${capturedFrames.size} frames saved")

        val event = Arguments.createMap().apply {
            putInt("frameCount", capturedFrames.size)
            putArray("frames", frames)
            putString("sessionDir", sessionDir ?: "")
        }
        dispatchEvent("onRecordingComplete", event)
        capturedFrames.clear()
    }

    // ── Manual frame capture ─────────────────────────────────────────────

    fun captureFrame() {
        val capture = imageCapture ?: run {
            Log.w(TAG, "captureFrame: imageCapture not ready")
            return
        }
        val dir = sessionDir ?: run {
            Log.w(TAG, "captureFrame: no active session")
            return
        }

        // Snapshot current rotation at the moment of capture
        val R: FloatArray
        synchronized(sensorLock) {
            R = currentRotationMatrix.clone()
        }

        val idx = frameIndex++
        val file = File(dir, "frame_%04d.jpg".format(idx))
        val outputOptions = ImageCapture.OutputFileOptions.Builder(file).build()

        capture.takePicture(
            outputOptions,
            cameraExecutor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(result: ImageCapture.OutputFileResults) {
                    processFrameCapture(file, R, idx)
                }

                override fun onError(exc: ImageCaptureException) {
                    Log.e(TAG, "Frame capture failed: ${exc.message}")
                    frameIndex-- // Roll back
                }
            }
        )
    }

    private fun processFrameCapture(file: File, R: FloatArray, idx: Int) {
        // --- Convert Android ENU rotation to Y-up world frame ---
        // Camera right = device +X in Y-up world: (R[0], R[6], R[3])
        val rightX = R[0].toDouble()
        val rightY = R[6].toDouble()
        val rightZ = R[3].toDouble()
        // Camera up = device +Y in Y-up world: (R[1], R[7], R[4])
        val upX = R[1].toDouble()
        val upY = R[7].toDouble()
        val upZ = R[4].toDouble()
        // Camera forward = device -Z in Y-up world: (-R[2], -R[8], -R[5])
        val fwdX = -R[2].toDouble()
        val fwdY = -R[8].toDouble()
        val fwdZ = -R[5].toDouble()

        val yaw = Math.toDegrees(atan2(fwdX, fwdZ))
        val pitch = Math.toDegrees(asin((-fwdY).coerceIn(-1.0, 1.0)))
        val roll = Math.toDegrees(atan2(upX, upY))

        // Build 9-element rotation matrix [Rx,Ry,Rz, Ux,Uy,Uz, Fx,Fy,Fz]
        val rotMatrix = Arguments.createArray().apply {
            pushDouble(rightX); pushDouble(rightY); pushDouble(rightZ)
            pushDouble(upX); pushDouble(upY); pushDouble(upZ)
            pushDouble(fwdX); pushDouble(fwdY); pushDouble(fwdZ)
        }

        // Get image dimensions (efficient — decode bounds only)
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, opts)
        val imgW = opts.outWidth.toDouble()
        val imgH = opts.outHeight.toDouble()

        // Scale camera intrinsics to captured image size
        val fx: Double
        val fy: Double
        val cx: Double
        val cy: Double
        if (intrinsicsReady && sensorImgW > 0) {
            fx = sensorFx * imgW / sensorImgW
            fy = sensorFy * imgH / sensorImgH
            cx = sensorCx * imgW / sensorImgW
            cy = sensorCy * imgH / sensorImgH
        } else {
            val hFovRad = Math.toRadians(cameraHFovDeg)
            fx = imgW / (2.0 * tan(hFovRad / 2.0))
            fy = fx
            cx = imgW / 2.0
            cy = imgH / 2.0
        }

        val entry = Arguments.createMap().apply {
            putString("path", file.absolutePath)
            putDouble("yaw", yaw)
            putDouble("pitch", pitch)
            putDouble("roll", roll)
            putDouble("hFov", cameraHFovDeg)
            putArray("rotationMatrix", rotMatrix)
            putDouble("timestamp", System.currentTimeMillis() / 1000.0)
            putDouble("fx", fx)
            putDouble("fy", fy)
            putDouble("cx", cx)
            putDouble("cy", cy)
            putDouble("imageWidth", imgW)
            putDouble("imageHeight", imgH)
        }

        mainHandler.post {
            capturedFrames.add(entry)

            // Notify JS of capture
            val orientEvent = Arguments.createMap().apply {
                putDouble("yaw", yaw)
                putDouble("pitch", pitch)
                putDouble("roll", roll)
                putInt("capturedCount", capturedFrames.size)
                putDouble("timestamp", System.currentTimeMillis() / 1000.0)
            }
            dispatchEvent("onOrientationUpdate", orientEvent)
        }

        Log.i(
            TAG,
            "Frame $idx captured: yaw=%.1f° pitch=%.1f° hFov=%.1f° size=${imgW.toInt()}x${imgH.toInt()}"
                .format(yaw, pitch, cameraHFovDeg)
        )
    }

    // ── Event dispatch ───────────────────────────────────────────────────

    private class ViewEvent(
        surfaceId: Int,
        viewId: Int,
        private val name: String,
        private val data: WritableMap
    ) : Event<ViewEvent>(surfaceId, viewId) {
        override fun getEventName(): String = name
        override fun getEventData(): WritableMap = data
    }

    private fun dispatchEvent(eventName: String, params: WritableMap) {
        val reactContext = context as? ReactContext ?: return
        val surfaceId = UIManagerHelper.getSurfaceId(this)
        val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
        if (dispatcher != null) {
            dispatcher.dispatchEvent(ViewEvent(surfaceId, id, eventName, params))
        } else {
            // Fallback for interop / bridge mode
            try {
                reactContext.getJSModule(RCTEventEmitter::class.java)
                    ?.receiveEvent(id, eventName, params)
            } catch (e: Exception) {
                Log.w(TAG, "Could not dispatch event $eventName: ${e.message}")
            }
        }
    }
}
