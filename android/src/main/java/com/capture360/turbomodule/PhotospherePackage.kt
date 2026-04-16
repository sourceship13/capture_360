package com.capture360.turbomodule

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [PhotosphereModule] with the React Native runtime. */
class PhotospherePackage : TurboReactPackage() {

    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        if (name == PhotosphereModule.NAME) PhotosphereModule(reactContext) else null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                PhotosphereModule.NAME to ReactModuleInfo(
                    /* name                   */ PhotosphereModule.NAME,
                    /* className              */ PhotosphereModule.NAME,
                    /* canOverrideExistingModule */ false,
                    /* needsEagerInit         */ false,
                    /* isCxxModule            */ false,
                    /* isTurboModule          */ true,
                ),
            )
        }
}
