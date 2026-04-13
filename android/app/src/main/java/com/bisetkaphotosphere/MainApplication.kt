package com.bisetkaphotosphere

import androidx.multidex.MultiDexApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.soloader.SoLoader
import com.bisetkaphotosphere.turbomodule.NativeDeviceInfoPackage
import com.bisetkaphotosphere.turbomodule.PhotospherePackage
import java.util.ArrayList

class MainApplication : MultiDexApplication() {

    private val mReactNativeHost = object : ReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean {
            return true  // DEBUG always true for now
        }

        override fun getPackages(): List<ReactPackage> {
            val packages = ArrayList<ReactPackage>()
            packages.add(NativeDeviceInfoPackage())
            packages.add(PhotospherePackage())
            return packages
        }

        override fun getJSMainModuleName(): String {
            return "index"
        }
    }

    override fun onCreate() {
        super.onCreate()
        SoLoader.init(this, false)
    }
}
