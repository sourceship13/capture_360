package com.bisetkaphotosphere.turbomodule

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

/**
 * Native module companion for ARCameraViewManager.
 *
 * On iOS, the ViewManager is also accessible as a NativeModule, so
 * JS calls `NativeModules.ARCameraView.captureFrame(tag)`.
 * On Android, ViewManagers are not NativeModules, so this separate
 * module bridges the gap.
 *
 * Uses ARCameraViewManager's static view registry to resolve views,
 * which works in both Bridge and Fabric/bridgeless modes.
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
        val view = ARCameraView.getByTag(tagInt)
        if (view != null) {
            view.captureFrame()
        } else {
            Log.w(TAG, "captureFrame: no ARCameraView found for tag $tagInt (registered: ${ARCameraView.getByTag(tagInt) != null})")
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
