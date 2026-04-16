package com.capture360.turbomodule

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseJavaModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Scalar
import org.opencv.imgproc.Imgproc
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.math.*

private const val TAG = "PhotosphereModule"

/**
 * PhotosphereModule — React Native native module that composites captured
 * frames into an equirectangular panorama using OpenCV.
 *
 * Port of the iOS OpenCVWrapper + RCTPhotosphereModule implementation.
 * Uses per-frame rotation matrices and pinhole intrinsics from ARCore/sensor
 * data to warp each frame onto a 4096×2048 equirectangular canvas.
 *
 * Registered via PhotospherePackage → MainApplication.
 */
@ReactModule(name = PhotosphereModule.NAME)
class PhotosphereModule(private val reactContext: ReactApplicationContext) :
    BaseJavaModule() {

    companion object {
        const val NAME = "NativePhotosphere"
    }

    private val isOpenCVReady: Boolean = OpenCVLoader.initLocal()

    override fun getName(): String = NAME

    // ─── Event emitter support ───────────────────────────────────────────
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) {
        // Required for RN NativeEventEmitter
    }

    private fun sendProgress(phase: String, current: Int, total: Int) {
        val params = Arguments.createMap().apply {
            putString("phase", phase)
            putInt("current", current)
            putInt("total", total)
        }
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("stitchProgress", params)
        } catch (e: Exception) {
            Log.w(TAG, "Could not send stitchProgress event: ${e.message}")
        }
    }

    // ─── Image loading with EXIF orientation normalisation ───────────────

    /**
     * Load a bitmap from disk and apply EXIF orientation.
     */
    private fun loadAndFixOrientation(filePath: String): Bitmap? {
        val path = if (filePath.startsWith("file://")) {
            filePath.removePrefix("file://")
        } else {
            filePath
        }
        val file = File(path)
        if (!file.exists()) return null

        val bitmap = BitmapFactory.decodeFile(path) ?: return null

        // Read EXIF orientation and apply rotation/flip
        val exif = ExifInterface(path)
        val orientation = exif.getAttributeInt(
            ExifInterface.TAG_ORIENTATION,
            ExifInterface.ORIENTATION_NORMAL
        )
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f); matrix.preScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f); matrix.preScale(-1f, 1f)
            }
        }

        return if (orientation != ExifInterface.ORIENTATION_NORMAL &&
            orientation != ExifInterface.ORIENTATION_UNDEFINED
        ) {
            val rotated = Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true
            )
            if (rotated !== bitmap) bitmap.recycle()
            rotated
        } else {
            bitmap
        }
    }

    /**
     * Load a bitmap from disk, applying EXIF orientation so pixels are
     * always in display orientation (equivalent to iOS NormaliseOrientation).
     */
    private fun loadAndNormaliseBitmap(filePath: String): Bitmap? {
        val path = if (filePath.startsWith("file://")) {
            filePath.removePrefix("file://")
        } else {
            filePath
        }
        val file = File(path)
        if (!file.exists()) return null

        val bitmap = BitmapFactory.decodeFile(path) ?: return null

        // Read EXIF orientation and apply rotation/flip
        val exif = ExifInterface(path)
        val orientation = exif.getAttributeInt(
            ExifInterface.TAG_ORIENTATION,
            ExifInterface.ORIENTATION_NORMAL
        )
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f); matrix.preScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f); matrix.preScale(-1f, 1f)
            }
        }

        return if (orientation != ExifInterface.ORIENTATION_NORMAL &&
            orientation != ExifInterface.ORIENTATION_UNDEFINED
        ) {
            val rotated = Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true
            )
            if (rotated !== bitmap) bitmap.recycle()
            rotated
        } else {
            bitmap
        }
    }

    /**
     * Convert a Bitmap (ARGB_8888) to an OpenCV Mat (RGBA).
     */
    private fun bitmapToMat(bitmap: Bitmap): Mat {
        val mat = Mat(bitmap.height, bitmap.width, CvType.CV_8UC4)
        Utils.bitmapToMat(bitmap, mat)
        return mat
    }

    /**
     * Convert an OpenCV Mat (RGBA with alpha=255) to a Bitmap.
     */
    private fun matToBitmap(mat: Mat): Bitmap {
        val bitmap = Bitmap.createBitmap(mat.cols(), mat.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(mat, bitmap)
        return bitmap
    }

    // =====================================================================
    // composeEquirect — Main entry point from JS
    // =====================================================================

    @ReactMethod
    fun composeEquirect(shots: ReadableArray, promise: Promise) {
        if (!isOpenCVReady) {
            promise.reject(
                "OPENCV_INIT_ERROR",
                "OpenCV native library could not be loaded on this device."
            )
            return
        }

        Thread {
            try {
                composeEquirectImpl(shots, promise)
            } catch (e: Exception) {
                Log.e(TAG, "composeEquirect exception", e)
                promise.reject("COMPOSE_ERROR", "Exception: ${e.message}", e)
            }
        }.start()
    }

    private data class FrameInput(
        val bitmap: Bitmap,
        val yaw: Double,
        val pitch: Double,
        val rotationMatrix: DoubleArray?,
        val fx: Double, val fy: Double,
        val cx: Double, val cy: Double,
        val imageWidth: Double, val imageHeight: Double
    )

    private fun composeEquirectImpl(shots: ReadableArray, promise: Promise) {
        // ── 1. Load and normalise all frames ─────────────────────────────
        val frames = ArrayList<FrameInput>()
        val totalShots = shots.size()

        for (idx in 0 until totalShots) {
            val shot = shots.getMap(idx) ?: continue
            val path = shot.getString("path") ?: continue

            val bitmap = loadAndNormaliseBitmap(path)
            if (bitmap == null) {
                Log.w(TAG, "[Stitch] WARN: can't load $path")
                continue
            }

            val yaw = if (shot.hasKey("yaw")) shot.getDouble("yaw") else 0.0
            val pitch = if (shot.hasKey("pitch")) shot.getDouble("pitch") else 0.0

            // Rotation matrix
            var rotMatrix: DoubleArray? = null
            if (shot.hasKey("rotationMatrix")) {
                val rm = shot.getArray("rotationMatrix")
                if (rm != null && rm.size() == 9) {
                    rotMatrix = DoubleArray(9) { rm.getDouble(it) }
                }
            }

            // Intrinsics
            val hasFx = shot.hasKey("fx") && shot.hasKey("fy") &&
                shot.hasKey("cx") && shot.hasKey("cy") &&
                shot.hasKey("imageWidth") && shot.hasKey("imageHeight")
            val fx = if (hasFx) shot.getDouble("fx") else 0.0
            val fy = if (hasFx) shot.getDouble("fy") else 0.0
            val cx = if (hasFx) shot.getDouble("cx") else 0.0
            val cy = if (hasFx) shot.getDouble("cy") else 0.0
            val imgW = if (hasFx) shot.getDouble("imageWidth") else 0.0
            val imgH = if (hasFx) shot.getDouble("imageHeight") else 0.0

            frames.add(
                FrameInput(
                    bitmap, yaw, pitch, rotMatrix,
                    fx, fy, cx, cy, imgW, imgH
                )
            )

            sendProgress("loading", idx + 1, totalShots)
        }

        if (frames.size < 2) {
            promise.reject(
                "COMPOSE_ERROR",
                "Need at least 2 images, got ${frames.size}"
            )
            frames.forEach { it.bitmap.recycle() }
            return
        }

        // ── 1b. Subsample if too many frames ────────────────────────────
        val kMaxFrames = 80
        val workFrames: List<FrameInput>
        if (frames.size > kMaxFrames) {
            Log.i(TAG, "[Stitch] Subsampling ${frames.size} → $kMaxFrames frames")
            val step = frames.size.toDouble() / kMaxFrames
            val sampled = ArrayList<FrameInput>(kMaxFrames)
            for (i in 0 until kMaxFrames) {
                sampled.add(frames[(i * step).toInt()])
            }
            // Recycle non-selected bitmaps
            val selectedSet = sampled.toSet()
            frames.forEach { if (it !in selectedSet) it.bitmap.recycle() }
            workFrames = sampled
        } else {
            workFrames = frames
        }

        // ── 2. Equirectangular compositing ──────────────────────────────
        val hFovFromShot = if (shots.size() > 0) {
            val s = shots.getMap(0)
            if (s != null && s.hasKey("hFov")) s.getDouble("hFov") else 43.0
        } else 43.0
        val hFov = if (hFovFromShot > 0) hFovFromShot else 43.0

        val canvasWidth = 4096
        val canvasHeight = canvasWidth / 2

        Log.i(
            TAG,
            "[Stitch] Compositing ${workFrames.size} frames (hFov=${hFov}°) canvas=${canvasWidth}x${canvasHeight}"
        )

        sendProgress("compositing", 0, workFrames.size)

        val result = compositeEquirectInternal(
            workFrames, hFov, canvasWidth, canvasHeight
        )

        if (result == null) {
            promise.reject("COMPOSE_ERROR", "Equirectangular compositing failed.")
            workFrames.forEach { it.bitmap.recycle() }
            return
        }

        // ── 3. Write JPEG ────────────────────────────────────────────────
        sendProgress("saving", 1, 1)

        val outputFile = File(
            reactContext.cacheDir,
            "pano_${System.currentTimeMillis()}.jpg"
        )
        val bitmap = matToBitmap(result)
        result.release()
        workFrames.forEach { it.bitmap.recycle() }

        FileOutputStream(outputFile).use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
        }
        bitmap.recycle()

        Log.i(TAG, "[Stitch] saved → ${outputFile.absolutePath}")
        promise.resolve(outputFile.absolutePath)
    }

    // =====================================================================
    // compositeEquirectInternal — Core stitching pipeline
    // Port of iOS compositeEquirectFallback
    // =====================================================================

    private data class FrameData(
        val src: Mat,            // RGBA source image (scaled)
        val R: DoubleArray,      // 9-element rotation [Rx,Ry,Rz, Ux,Uy,Uz, Fx,Fy,Fz]
        val fx: Double, val fy: Double,
        val cx: Double, val cy: Double,
        val imgW: Double, val imgH: Double
    )

    private fun compositeEquirectInternal(
        inputs: List<FrameInput>,
        hFovDegrees: Double,
        width: Int,
        height: Int
    ): Mat? {
        val frameInputs = inputs
        val hFovRad = hFovDegrees * PI / 180.0
        val numFrames = frameInputs.size

        // ══════════════════════════════════════════════════════════════════
        // STEP 0: Load all source images and extract rotation matrices
        // ══════════════════════════════════════════════════════════════════
        val frames = ArrayList<FrameData>(numFrames)

        for (ki in 0 until numFrames) {
            val fi = frameInputs[ki]

            var src = bitmapToMat(fi.bitmap)

            // Scale down for performance (max 2400px)
            val maxDim = max(src.cols().toDouble(), src.rows().toDouble())
            if (maxDim > 2400) {
                val s = 2400.0 / maxDim
                val scaled = Mat()
                Imgproc.resize(src, scaled, org.opencv.core.Size(src.cols() * s, src.rows() * s), 0.0, 0.0, Imgproc.INTER_AREA)
                src.release()
                src = scaled
            }

            val imgW = src.cols().toDouble()
            val imgH = src.rows().toDouble()

            // Intrinsics
            val fx: Double
            val fy: Double
            val cx: Double
            val cy: Double
            if (fi.fx > 0 && fi.fy > 0 && fi.imageWidth > 0) {
                val sx = imgW / fi.imageWidth
                val sy = imgH / fi.imageHeight
                fx = fi.fx * sx
                fy = fi.fy * sy
                cx = fi.cx * sx
                cy = fi.cy * sy
                Log.i(TAG, "[STEP0] Frame $ki: real intrinsics fx=%.1f fy=%.1f cx=%.1f cy=%.1f (scale=%.3f)".format(fx, fy, cx, cy, sx))
            } else {
                val vFovRad = 2.0 * atan(tan(hFovRad / 2.0) * (imgH / imgW))
                fx = imgW / (2.0 * tan(hFovRad / 2.0))
                fy = imgH / (2.0 * tan(vFovRad / 2.0))
                cx = imgW / 2.0
                cy = imgH / 2.0
                Log.i(TAG, "[STEP0] Frame $ki: derived intrinsics fx=%.1f fy=%.1f (from hFov=%.1f°)".format(fx, fy, hFovDegrees))
            }

            // Rotation
            val R: DoubleArray
            if (fi.rotationMatrix != null) {
                R = fi.rotationMatrix
            } else {
                val yawRad = fi.yaw * PI / 180.0
                val pitchRad = fi.pitch * PI / 180.0
                val cY = cos(yawRad); val sY = sin(yawRad)
                val cP = cos(pitchRad); val sP = sin(pitchRad)
                R = doubleArrayOf(
                    cY, 0.0, -sY,         // right
                    sY * sP, cP, cY * sP,  // up
                    sY * cP, -sP, cY * cP  // forward
                )
            }

            frames.add(FrameData(src, R, fx, fy, cx, cy, imgW, imgH))
        }

        if (frames.size < 2) return null

        Log.i(TAG, "[Equirect] Using ${frames.size} frames for compositing")

        // ══════════════════════════════════════════════════════════════════
        // STEP 1: ORB rotation refinement — DISABLED
        // Using raw rotation matrices directly (same as iOS).
        // ══════════════════════════════════════════════════════════════════
        Log.i(TAG, "[RotRefine] Skipped — using raw rotations for all ${frames.size} frames")

        // ══════════════════════════════════════════════════════════════════
        // STEP 2: Warp each frame to equirectangular canvas
        // ══════════════════════════════════════════════════════════════════
        val warpedFrames = ArrayList<Mat>(numFrames)
        val warpedWeights = ArrayList<Mat>(numFrames)

        for (ki in 0 until frames.size) {
            val warpedFrame = Mat.zeros(height, width, CvType.CV_8UC3)
            val warpedWeight = Mat.zeros(height, width, CvType.CV_32FC1)

            val fd = frames[ki]
            val src = fd.src  // RGBA

            val Rx = fd.R[0]; val Ry = fd.R[1]; val Rz = fd.R[2]
            val Ux = fd.R[3]; val Uy = fd.R[4]; val Uz = fd.R[5]
            val Fx = fd.R[6]; val Fy = fd.R[7]; val Fz = fd.R[8]

            val srcW = fd.imgW
            val srcH = fd.imgH

            for (canvasY in 0 until height) {
                for (canvasX in 0 until width) {
                    val lon = (canvasX.toDouble() / width) * 2.0 * PI - PI
                    val lat = PI / 2.0 - (canvasY.toDouble() / height) * PI
                    val cosLat = cos(lat)
                    val dx = cosLat * sin(lon)
                    val dy = sin(lat)
                    val dz = cosLat * cos(lon)

                    val xc = Rx * dx + Ry * dy + Rz * dz
                    val yc = Ux * dx + Uy * dy + Uz * dz
                    val zc = Fx * dx + Fy * dy + Fz * dz
                    if (zc <= 0) continue

                    val u = fd.fx * (xc / zc) + fd.cx
                    val v = fd.fy * (yc / zc) + fd.cy
                    if (u < 0 || u >= srcW - 1 || v < 0 || v >= srcH - 1) continue

                    val u0 = u.toInt(); val v0 = v.toInt()
                    val du = u - u0; val dv = v - v0

                    // Bilinear interpolation from RGBA source
                    val p00 = src.get(v0, u0)
                    val p01 = src.get(v0, u0 + 1)
                    val p10 = src.get(v0 + 1, u0)
                    val p11 = src.get(v0 + 1, u0 + 1)
                    if (p00 == null || p01 == null || p10 == null || p11 == null) continue

                    val pixel = DoubleArray(3)
                    for (c in 0..2) {
                        val value = (1 - du) * (1 - dv) * p00[c] +
                            du * (1 - dv) * p01[c] +
                            (1 - du) * dv * p10[c] +
                            du * dv * p11[c]
                        pixel[c] = min(value, 255.0)
                    }
                    warpedFrame.put(canvasY, canvasX, pixel[0], pixel[1], pixel[2])

                    val edgeDist = min(
                        min(u, srcW - 1 - u),
                        min(v, srcH - 1 - v)
                    )
                    warpedWeight.put(canvasY, canvasX, edgeDist)
                }
            }

            warpedFrames.add(warpedFrame)
            warpedWeights.add(warpedWeight)
            sendProgress("compositing", ki + 1, frames.size)
            Log.i(TAG, "[Equirect] Warped frame ${ki + 1}/${frames.size}")
        }

        // ══════════════════════════════════════════════════════════════════
        // STEP 3: Per-channel exposure compensation
        // ══════════════════════════════════════════════════════════════════
        val channelMeans = Array(frames.size) { DoubleArray(3) }
        val globalSum = DoubleArray(3)
        var globalCount = 0L

        for (ki in 0 until frames.size) {
            val sum = DoubleArray(3)
            var count = 0L
            for (r in 0 until height) {
                for (c in 0 until width) {
                    val w = warpedWeights[ki].get(r, c) ?: continue
                    if (w[0] > 0) {
                        val px = warpedFrames[ki].get(r, c) ?: continue
                        sum[0] += px[0]; sum[1] += px[1]; sum[2] += px[2]
                        count++
                    }
                }
            }
            if (count > 0) {
                channelMeans[ki] = doubleArrayOf(sum[0] / count, sum[1] / count, sum[2] / count)
            } else {
                channelMeans[ki] = doubleArrayOf(128.0, 128.0, 128.0)
            }
            globalSum[0] += sum[0]; globalSum[1] += sum[1]; globalSum[2] += sum[2]
            globalCount += count
        }

        val globalMean = if (globalCount > 0) {
            doubleArrayOf(
                globalSum[0] / globalCount,
                globalSum[1] / globalCount,
                globalSum[2] / globalCount
            )
        } else {
            doubleArrayOf(128.0, 128.0, 128.0)
        }

        for (ki in 0 until frames.size) {
            val sc = DoubleArray(3) { ch ->
                val s = if (channelMeans[ki][ch] > 1) globalMean[ch] / channelMeans[ki][ch] else 1.0
                s.coerceIn(0.6, 1.6)
            }
            for (r in 0 until height) {
                for (c in 0 until width) {
                    val w = warpedWeights[ki].get(r, c) ?: continue
                    if (w[0] > 0) {
                        val px = warpedFrames[ki].get(r, c) ?: continue
                        warpedFrames[ki].put(
                            r, c,
                            min(px[0] * sc[0], 255.0),
                            min(px[1] * sc[1], 255.0),
                            min(px[2] * sc[2], 255.0)
                        )
                    }
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // STEP 4: Normalized power-weighted blend
        // Normalizing to [0,1] then using 8th power makes the dominant
        // frame win by 100:1 even in overlap zones, eliminating ghosting
        // while keeping mathematically smooth transitions.
        // ══════════════════════════════════════════════════════════════════
        val maxED = FloatArray(frames.size) { ki ->
            val m = min(frames[ki].imgW, frames[ki].imgH).toFloat() * 0.5f
            if (m < 1f) 1f else m
        }

        val result = Mat(height, width, CvType.CV_8UC4, Scalar(0.0, 0.0, 0.0, 0.0))
        for (r in 0 until height) {
            for (c in 0 until width) {
                var totalW = 0.0f
                var bR = 0.0f; var bG = 0.0f; var bB = 0.0f

                for (ki in 0 until frames.size) {
                    val edArr = warpedWeights[ki].get(r, c) ?: continue
                    val ed = edArr[0].toFloat()
                    if (ed > 0) {
                        val norm = ed / maxED[ki]
                        // 8th power
                        var w = norm * norm      // ^2
                        w = w * w                // ^4
                        w = w * w                // ^8
                        val px = warpedFrames[ki].get(r, c) ?: continue
                        bR += w * px[0].toFloat()
                        bG += w * px[1].toFloat()
                        bB += w * px[2].toFloat()
                        totalW += w
                    }
                }
                if (totalW > 0) {
                    result.put(
                        r, c,
                        min((bR / totalW).toDouble(), 255.0),
                        min((bG / totalW).toDouble(), 255.0),
                        min((bB / totalW).toDouble(), 255.0),
                        255.0
                    )
                }
            }
        }

        // Release intermediate mats
        warpedFrames.forEach { it.release() }
        warpedWeights.forEach { it.release() }
        frames.forEach { it.src.release() }

        Log.i(TAG, "[Equirect] Done: ${width}x${height} (${frames.size} frames)")
        return result
    }

    // =====================================================================
    // stitchHorizontal — Simple 3-image horizontal compositor (JS-facing alias)
    // =====================================================================

    /**
     * Stitches 3 images horizontally as a convenience wrapper around stitchImages.
     */
    @ReactMethod
    fun stitchHorizontal(paths: ReadableArray, promise: Promise) {
        stitchImages(paths, promise)
    }

    // =====================================================================
    // stitchImages — Legacy left-to-right linear compositor (kept for reference)
    // =====================================================================

    /**
     * Stitch images side-by-side using Android Canvas API.
     * Matches iOS implementation: loads frames, normalizes EXIF orientation,
     * scales to same height as first frame, positions left-to-right with
     * feathered seams, and outputs JPEG to cache directory.
     */
    @ReactMethod
    fun stitchImages(imagePaths: ReadableArray, promise: Promise) {
        Thread {
            try {
                // ── 1. Load and normalise every frame ───────────────────────
                val frames = ArrayList<Bitmap>()
                for (i in 0 until imagePaths.size()) {
                    val path = imagePaths.getString(i)
                    val posix = if (path != null && path.startsWith("file://")) {
                        path.removePrefix("file://")
                    } else {
                        path ?: ""
                    }

                    val raw = BitmapFactory.decodeFile(posix)
                    if (raw == null) {
                        Log.w(TAG, "[Pano] WARN: could not load $posix")
                        continue
                    }

                    // Apply EXIF orientation fix (matches iOS NormaliseOrientation)
                    val norm = loadAndFixOrientation(posix)
                    frames.add(norm ?: raw)
                }

                if (frames.size < 2) {
                    promise.reject(
                        "STITCH_ERROR",
                        "Need at least 2 images; loaded ${frames.size}/${imagePaths.size()}"
                    )
                    return@Thread
                }

                // ── 2. Normalise all frames to the same height as frame 0 ────
                val targetH = (frames[0].height).toDouble()
                val scaled = ArrayList<Bitmap>(frames.size)
                for (f in frames) {
                    if (abs(f.height - targetH) < 1.0) {
                        scaled.add(f)
                    } else {
                        val ratio = targetH / f.height
                        val szW = (f.width * ratio).toInt()
                        val szH = targetH.toInt()
                        scaled.add(
                            Bitmap.createScaledBitmap(f, szW, szH, true)
                        )
                    }
                }

                // ── 3. Pre-compute LEFT-EDGE x-position of each frame ──────
                val kOverlap = 0.0f
                val kFeatherPx = 40.0f // pixels of soft blend at each seam
                val kMaxW = 4096.0f

                val xs = ArrayList<Float>(scaled.size)
                var cursor = 0.0f
                for (i in scaled.indices) {
                    xs.add(cursor)
                    if (i + 1 < scaled.size) {
                        cursor += scaled[i].width * (1.0f - kOverlap)
                    }
                }

                // Canvas width = x-position of last frame + its own width
                val rawW = xs.last() + scaled.last().width.toDouble()
                val outScale = min(1.0, kMaxW / rawW)
                val canvasW = max(1, (rawW * outScale).toInt())
                val canvasH = max(1, (targetH * outScale).toInt())

                Log.i(TAG, "[Pano] canvas=${canvasW}x${canvasH} scale=${outScale} n=${scaled.size}")

                // ── 4. Draw all frames left-to-right with cross-fade seams ──
                val bitmap = Bitmap.createBitmap(canvasW, canvasH, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bitmap)

                for (i in scaled.indices) {
                    val img = scaled[i]
                    val x = xs[i] * outScale
                    val imgW = img.width * outScale
                    val imgH = img.height * outScale // same as canvasH

                    Log.i(TAG, "[Pano] frame$i → x=${x.toInt()} w=${imgW.toInt()} h=${imgH.toInt()}")

                    // (a) Draw this frame fully at its canvas position
                    canvas.drawBitmap(
                        img,
                        x.toFloat(),
                        0f,
                        null
                    )

                    // (b) Feather the seam: at the LEFT edge of this frame, overdraw a
                    //     thin strip with the previous frame at linearly-decreasing alpha
                    if (i > 0) {
                        val prev = scaled[i - 1]
                        val px = xs[i - 1] * outScale
                        val pw = prev.width * outScale

                        val fadeW = min(kFeatherPx * outScale, imgW * 0.05).toFloat()
                        val kSlices = 16
                        val sw = fadeW / kSlices

                        for (s in 0 until kSlices) {
                            // alpha: 1.0 at seam → 0 at feather edge
                            val alpha = 1.0f - s.toFloat() / (kSlices - 1).toFloat()
                            val sliceX = x + s * sw

                            canvas.save()
                            canvas.clipRect(
                                sliceX.toInt(),
                                0,
                                (sliceX + sw).toInt(),
                                imgH.toInt()
                            )
                            // Use Paint with alpha instead of deprecated Canvas.setAlpha
                            val paint = Paint().apply { this.alpha = (alpha * 255).toInt() }
                            canvas.drawBitmap(prev, px.toFloat(), 0f, paint)
                            canvas.restore()
                        }
                    }
                }

                // Force orientation up (no EXIF rotation tags)
                val panorama = Bitmap.createBitmap(
                    bitmap,
                    0, 0,
                    bitmap.width, bitmap.height,
                    null, true
                )

                // ── 5. Encode as JPEG and write to tmp ───────────────────────
                val jpegOutputStream = ByteArrayOutputStream()
                panorama.compress(Bitmap.CompressFormat.JPEG, 88, jpegOutputStream)
                val jpegBytes = jpegOutputStream.toByteArray()

                // Embed dimensions in filename for easy diagnostics (matches iOS)
                val name = String.format(
                    "pano_%dx%d_%d.jpg",
                    canvasW,
                    canvasH,
                    System.currentTimeMillis()
                )
                val outputFile = File(reactContext.cacheDir, name)

                FileOutputStream(outputFile).use { out ->
                    out.write(jpegBytes)
                }

                Log.i(TAG, "[Pano] saved → ${outputFile.absolutePath}")
                promise.resolve(outputFile.absolutePath)
            } catch (e: Exception) {
                Log.e(TAG, "stitchImages exception", e)
                promise.reject("STITCH_ERROR", "Exception: ${e.message}", e)
            }
        }.start()
    }

    // =====================================================================
    // readFileBase64
    // =====================================================================

    @ReactMethod
    fun readFileBase64(filePath: String?, promise: Promise) {
        try {
            val path = if (filePath != null && filePath.startsWith("file://")) {
                filePath.removePrefix("file://")
            } else {
                filePath ?: ""
            }
            val bytes = File(path).readBytes()
            val base64 = android.util.Base64.encodeToString(
                bytes,
                android.util.Base64.NO_WRAP,
            )
            promise.resolve(base64)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", "Could not read file: ${e.message}", e)
        }
    }
}
