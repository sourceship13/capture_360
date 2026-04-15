package com.bisetkaphotosphere.turbomodule

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerModule

/**
 * Native module companion for ARCameraViewManager.
 *
 * On iOS, the ViewManager is also accessible as a NativeModule, so
 * JS calls `NativeModules.ARCameraView.captureFrame(tag)`.
 * On Android, ViewManagers are not NativeModules, so this separate
 * module bridges the gap.
 */
@ReactModule(name = ARCameraViewModule.NAME)
class ARCameraViewModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ARCameraView"
        private const val TAG = "ARCameraViewModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun captureFrame(tag: Double) {
        val tagInt = tag.toInt()
        val uiManager = reactApplicationContext.getNativeModule(UIManagerModule::class.java)
        if (uiManager == null) {
            Log.w(TAG, "captureFrame: UIManagerModule not available")
            return
        }
        uiManager.addUIBlock { nativeViewHierarchyManager ->
            try {
                val view = nativeViewHierarchyManager.resolveView(tagInt)
                if (view is ARCameraView) {
                    view.captureFrame()
                } else {
                    Log.w(TAG, "captureFrame: view $tagInt is not ARCameraView (${view?.javaClass?.simpleName})")
                }
            } catch (e: Exception) {
                Log.e(TAG, "captureFrame: could not resolve view $tagInt", e)
            }
        }
    }

    @ReactMethod
    fun captureFrameWithGrid(
        tag: Double,
        gridRow: Double,
        gridCol: Double,
        targetYaw: Double,
        targetPitch: Double
    ) {
        // Grid metadata is stored in JS; just trigger the capture
        captureFrame(tag)
    }
}
