package com.capture360example

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class NativeDeviceInfoPackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == NativeDeviceInfoModule.NAME) {
            NativeDeviceInfoModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                NativeDeviceInfoModule.NAME to ReactModuleInfo(
                    NativeDeviceInfoModule.NAME,  // name
                    NativeDeviceInfoModule.NAME,  // className
                    false,                         // canOverrideExistingModule
                    false,                         // needsEagerInit
                    false,                         // isCxxModule
                    true                           // isTurboModule
                )
            )
        }
    }
}
