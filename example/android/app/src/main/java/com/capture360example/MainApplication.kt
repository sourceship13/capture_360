package com.capture360example

import android.app.Application
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.bisetkaphotosphere.turbomodule.Capture360Package

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
    object : DefaultReactNativeHost(this) {
      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override fun getPackages(): MutableList<ReactPackage> =
        mutableListOf(Capture360Package())

      override fun getJSMainModuleName(): String = "index"
    }

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
  }
}
