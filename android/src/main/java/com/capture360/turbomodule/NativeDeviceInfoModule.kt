package com.capture360.turbomodule

import android.os.BatteryManager
import android.os.Build
import android.content.Context
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.BaseJavaModule
import java.util.Locale

@ReactModule(name = NativeDeviceInfoModule.NAME)
class NativeDeviceInfoModule(private val reactContext: ReactApplicationContext) : BaseJavaModule() {

    companion object {
        const val NAME = "NativeDeviceInfo"
    }

    override fun getName(): String = NAME

    // --- Constants ---
    override fun getConstants(): Map<String, Any> {
        val constants = HashMap<String, Any>()
        constants["platform"] = "android"
        try {
            val pInfo = reactContext.packageManager.getPackageInfo(reactContext.packageName, 0)
            constants["appVersion"] = pInfo.versionName ?: "unknown"
            constants["buildNumber"] = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toString()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode.toString()
            }
        } catch (e: Exception) {
            constants["appVersion"] = "unknown"
            constants["buildNumber"] = "unknown"
        }
        return constants
    }

    // --- Synchronous method ---
    @com.facebook.react.bridge.ReactMethod(isBlockingSynchronousMethod = true)
    fun getDeviceName(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL}"
    }

    // --- Async / Promise method ---
    @com.facebook.react.bridge.ReactMethod
    fun getBatteryLevel(promise: Promise) {
        try {
            val batteryManager = reactContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val level = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            promise.resolve(level.toDouble() / 100.0)
        } catch (e: Exception) {
            promise.reject("BATTERY_ERROR", "Failed to get battery level", e)
        }
    }

    // --- Method with arguments returning a Promise ---
    @com.facebook.react.bridge.ReactMethod
    fun multiply(a: Double, b: Double, promise: Promise) {
        promise.resolve(a * b)
    }

    // --- Callback method ---
    @com.facebook.react.bridge.ReactMethod
    fun getDeviceLocale(callback: Callback) {
        val locale = Locale.getDefault().toLanguageTag()
        callback.invoke(locale)
    }

    // --- Event emitter support ---
    @com.facebook.react.bridge.ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter — no-op on Android for setup
    }

    @com.facebook.react.bridge.ReactMethod
    fun removeListeners(count: Double) {
        // Required for NativeEventEmitter — no-op on Android for teardown
    }

    /**
     * Helper to send an event to JS. Can be called from anywhere in native code.
     */
    fun sendEvent(eventName: String, params: WritableNativeMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
