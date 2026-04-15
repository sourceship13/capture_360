package com.bisetkaphotosphere.turbomodule

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

private const val TAG = "VideoRecorderModule"

/**
 * VideoRecorderModule — Android port of the iOS RCTVideoRecorderModule.
 *
 * Provides:
 * - requestCameraPermission() → 'granted' | 'denied'
 * - extractFrames(videoPath, fps) → { success, frameCount, frames[], sessionDir, duration }
 * - testModule() → { success, message }
 */
@ReactModule(name = VideoRecorderModule.NAME)
class VideoRecorderModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "VideoRecorder"
        private const val CAMERA_PERMISSION_REQUEST_CODE = 9001
    }

    override fun getName(): String = NAME

    /**
     * Request camera permission.
     * Returns 'granted' if already granted, 'denied' otherwise.
     * On Android, the actual permission dialog is handled by the Activity;
     * this method checks the current state and triggers the system dialog if needed.
     */
    @ReactMethod
    fun requestCameraPermission(promise: Promise) {
        try {
            val granted = ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED

            if (granted) {
                promise.resolve("granted")
                return
            }

            // Request permission via the current Activity
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                androidx.core.app.ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.CAMERA),
                    CAMERA_PERMISSION_REQUEST_CODE
                )
                // Note: The actual result comes via onRequestPermissionsResult.
                // For simplicity, we re-check after a short delay.
                // In production, use ActivityEventListener for proper handling.
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    val nowGranted = ContextCompat.checkSelfPermission(
                        reactContext, Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED
                    promise.resolve(if (nowGranted) "granted" else "denied")
                }, 2000)
            } else {
                promise.resolve("denied")
            }
        } catch (e: Exception) {
            Log.e(TAG, "requestCameraPermission error", e)
            promise.resolve("denied")
        }
    }

    /**
     * Extract frames from a video file at the given FPS rate.
     * Returns an object with success, frameCount, frames array, sessionDir, and duration.
     */
    @ReactMethod
    fun extractFrames(videoPath: String, fps: Double, promise: Promise) {
        Thread {
            try {
                extractFramesImpl(videoPath, fps, promise)
            } catch (e: Exception) {
                Log.e(TAG, "extractFrames error", e)
                promise.reject("EXTRACT_ERROR", "Frame extraction failed: ${e.message}", e)
            }
        }.start()
    }

    private fun extractFramesImpl(videoPath: String, fps: Double, promise: Promise) {
        val path = if (videoPath.startsWith("file://")) {
            videoPath.removePrefix("file://")
        } else {
            videoPath
        }

        Log.i(TAG, "[VideoRecorder] extractFrames called: path=$path, fps=$fps")

        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(path)
        } catch (e: Exception) {
            promise.reject("INVALID_VIDEO", "Cannot open video: ${e.message}", e)
            return
        }

        val durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
        val durationMs = durationStr?.toLongOrNull() ?: 0L
        val durationSec = durationMs / 1000.0

        if (durationSec <= 0) {
            retriever.release()
            promise.reject("INVALID_VIDEO", "Video has zero duration")
            return
        }

        // Create output directory
        val sessionDir = File(
            reactContext.filesDir,
            "photosphere_${UUID.randomUUID()}"
        ).also { it.mkdirs() }

        val intervalUs = (1_000_000.0 / fps).toLong() // microseconds
        val framePaths = mutableListOf<Map<String, Any>>()
        var timeUs = 0L
        var index = 0

        Log.i(TAG, "[VideoRecorder] Extracting frames over ${durationSec}s at ${fps}fps")

        while (timeUs < durationMs * 1000) {
            val bitmap = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
            if (bitmap != null) {
                val framePath = File(sessionDir, "frame_%04d.jpg".format(index))
                FileOutputStream(framePath).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
                }
                bitmap.recycle()

                framePaths.add(
                    mapOf(
                        "path" to framePath.absolutePath,
                        "timestamp" to (timeUs / 1_000_000.0)
                    )
                )
                index++
            }
            timeUs += intervalUs
        }

        retriever.release()

        Log.i(TAG, "[VideoRecorder] Extraction complete: ${framePaths.size} frames")

        val framesArray = Arguments.createArray()
        for (frame in framePaths) {
            val map = Arguments.createMap()
            map.putString("path", frame["path"] as String)
            map.putDouble("timestamp", frame["timestamp"] as Double)
            framesArray.pushMap(map)
        }

        val result = Arguments.createMap()
        result.putBoolean("success", true)
        result.putInt("frameCount", framePaths.size)
        result.putArray("frames", framesArray)
        result.putString("sessionDir", sessionDir.absolutePath)
        result.putDouble("duration", durationSec)
        promise.resolve(result)
    }

    /**
     * Simple test to verify the module is reachable from JS.
     */
    @ReactMethod
    fun testModule(promise: Promise) {
        Log.i(TAG, "[VideoRecorder] testModule called!")
        val result = Arguments.createMap()
        result.putBoolean("success", true)
        result.putString("message", "Module is working!")
        promise.resolve(result)
    }

}
