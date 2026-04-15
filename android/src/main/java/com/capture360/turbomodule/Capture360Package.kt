package com.bisetkaphotosphere.turbomodule

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Unified ReactPackage that registers all native modules and view managers
 * for the bisetka-photosphere library.
 *
 * Modules:
 *  - PhotosphereModule      (equirectangular stitching)
 *  - VideoRecorderModule    (camera permission + frame extraction)
 *  - NativeDeviceInfoModule (device info)
 *  - ARCameraViewModule     (captureFrame bridge for JS)
 *
 * View Managers:
 *  - ARCameraViewManager    (camera preview + orientation tracking)
 */
class Capture360Package : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(
        PhotosphereModule(reactContext),
        VideoRecorderModule(reactContext),
        NativeDeviceInfoModule(reactContext),
        ARCameraViewModule(reactContext),
    )

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = listOf(
        ARCameraViewManager(),
    )
}
