package com.bisetkaphotosphere.turbomodule

import com.facebook.react.bridge.BaseJavaModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import org.opencv.android.OpenCVLoader
import org.opencv.core.Mat
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.stitching.Stitcher
import java.io.File

/**
 * PhotosphereModule — TurboModule that stitches multiple overlapping images
 * into a wide panorama JPEG using OpenCV's Stitcher pipeline.
 *
 * Dependency: add to android/app/build.gradle:
 *   implementation("org.opencv:opencv:4.10.0")
 *
 * Registered via PhotospherePackage → MainApplication.
 */
@ReactModule(name = PhotosphereModule.NAME)
class PhotosphereModule(private val reactContext: ReactApplicationContext) :
    BaseJavaModule() {

    companion object {
        const val NAME = "NativePhotosphere"
    }

    /** Whether the OpenCV native library loaded successfully on this device. */
    private val isOpenCVReady: Boolean = OpenCVLoader.initLocal()

    override fun getName(): String = NAME

    /**
     * Stitches [imagePaths] into a panorama using OpenCV's Stitcher.
     *
     * Runs on a dedicated background thread so the JS thread is never blocked.
     * The resulting JPEG is written to the app's cache directory.
     *
     * Status codes returned by [Stitcher.stitch]:
     *   OK = 0, ERR_NEED_MORE_IMGS = 1, ERR_HOMOGRAPHY_EST_FAIL = 2,
     *   ERR_CAMERA_PARAMS_ADJUST_FAIL = 3
     */
    @ReactMethod
    fun stitchImages(imagePaths: ReadableArray, promise: Promise) {
        if (!isOpenCVReady) {
            promise.reject(
                "OPENCV_INIT_ERROR",
                "OpenCV native library could not be loaded on this device.",
            )
            return
        }

        Thread {
            val mats = ArrayList<Mat>()
            try {
                // ── Load images ──────────────────────────────────────────────
                for (i in 0 until imagePaths.size()) {
                    val path = imagePaths.getString(i) ?: continue
                    val mat = Imgcodecs.imread(path)
                    if (!mat.empty()) {
                        mats.add(mat)
                    }
                }

                if (mats.size < 2) {
                    promise.reject(
                        "STITCH_ERROR",
                        "Need at least 2 valid images to stitch (loaded ${mats.size}).",
                    )
                    return@Thread
                }

                // ── Run OpenCV Stitcher ──────────────────────────────────────
                val pano = Mat()
                val stitcher = Stitcher.create(Stitcher.PANORAMA)

                // Disable wave-correction for faster stitching on mobile.
                // Re-enable if the horizon appears curved on the output image.
                stitcher.setWaveCorrection(false)

                val status = stitcher.stitch(mats, pano)

                when (status) {
                    Stitcher.OK -> {
                        val output = File(
                            reactContext.cacheDir,
                            "photosphere_${System.currentTimeMillis()}.jpg",
                        )
                        if (Imgcodecs.imwrite(output.absolutePath, pano)) {
                            promise.resolve(output.absolutePath)
                        } else {
                            promise.reject(
                                "STITCH_ERROR",
                                "Stitching succeeded but JPEG could not be written to disk.",
                            )
                        }
                        pano.release()
                    }

                    Stitcher.ERR_NEED_MORE_IMGS ->
                        promise.reject(
                            "STITCH_ERROR",
                            "Not enough overlapping images. " +
                                "Capture with more overlap between adjacent frames.",
                        )

                    Stitcher.ERR_HOMOGRAPHY_EST_FAIL ->
                        promise.reject(
                            "STITCH_ERROR",
                            "Homography estimation failed. " +
                                "Ensure adjacent frames share at least 20–30% overlap.",
                        )

                    Stitcher.ERR_CAMERA_PARAMS_ADJUST_FAIL ->
                        promise.reject(
                            "STITCH_ERROR",
                            "Camera parameter adjustment failed. " +
                                "Try capturing on a scene with more texture.",
                        )

                    else ->
                        promise.reject(
                            "STITCH_ERROR",
                            "OpenCV Stitcher returned unexpected status code: $status",
                        )
                }
            } catch (e: Exception) {
                promise.reject(
                    "STITCH_ERROR",
                    "Exception during panorama stitching: ${e.message}",
                    e,
                )
            } finally {
                // Always release native Mat memory to prevent leaks
                mats.forEach { it.release() }
            }
        }.start()
    }

    /**
     * Reads a file from disk and returns its contents as a base64-encoded string.
     * Used to pass the stitched panorama into the WebView-based sphere viewer.
     */
    @ReactMethod
    fun readFileBase64(filePath: String, promise: Promise) {
        try {
            val path = if (filePath.startsWith("file://")) {
                filePath.removePrefix("file://")
            } else {
                filePath
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
