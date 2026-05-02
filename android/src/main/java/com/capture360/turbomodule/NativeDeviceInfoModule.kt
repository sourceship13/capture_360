package com.capture360.turbomodule

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.os.Build
import android.view.Surface
import android.view.WindowManager
import com.facebook.react.bridge.BaseJavaModule
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

@ReactModule(name = NativeDeviceInfoModule.NAME)
class NativeDeviceInfoModule(private val reactContext: ReactApplicationContext) : BaseJavaModule(), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var rotationVectorSensor: Sensor? = null
    private var isTracking = false
    private var lastUpdateMs = 0L

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

    // --- Attitude tracking (gyroscope + accelerometer fusion) ---

    @com.facebook.react.bridge.ReactMethod
    fun startAttitudeUpdates() {
        if (isTracking) return
        val sm = reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        sensorManager = sm
        rotationVectorSensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        if (rotationVectorSensor != null) {
            sm.registerListener(this, rotationVectorSensor, SensorManager.SENSOR_DELAY_GAME)
            isTracking = true
            android.util.Log.d("NativeDeviceInfo", "startAttitudeUpdates: registered rotation vector sensor")
        } else {
            android.util.Log.w("NativeDeviceInfo", "TYPE_ROTATION_VECTOR not available on this device")
        }
    }

    @com.facebook.react.bridge.ReactMethod
    fun stopAttitudeUpdates() {
        if (!isTracking) return
        sensorManager?.unregisterListener(this)
        isTracking = false
        android.util.Log.d("NativeDeviceInfo", "stopAttitudeUpdates")
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return

        // Throttle to ~30 fps to match iOS update rate
        val now = System.currentTimeMillis()
        if (now - lastUpdateMs < 33) return
        lastUpdateMs = now

        // Build 3×3 rotation matrix from the rotation vector sensor.
        // R is row-major; world_vec = R * device_vec.
        // World frame = ENU: X=East, Y=North, Z=Up
        // Device frame: X=right, Y=top, Z=out-of-screen (toward user)
        val R = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(R, event.values)

        // Remap coordinate system so portrait and landscape both work
        val remapped = FloatArray(9)
        // On Android 12+ (API 31+), reactContext.display throws UnsupportedOperationException
        // because ReactApplicationContext is not a visual/display-associated context.
        // Use currentActivity.display if available, fall back to deprecated WindowManager.
        val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            reactContext.currentActivity?.display
                ?: run {
                    @Suppress("DEPRECATION")
                    (reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay
                }
        } else {
            @Suppress("DEPRECATION")
            (reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay
        }
        val ok = when (display?.rotation) {
            Surface.ROTATION_90  -> SensorManager.remapCoordinateSystem(R, SensorManager.AXIS_Y, SensorManager.AXIS_MINUS_X, remapped)
            Surface.ROTATION_270 -> SensorManager.remapCoordinateSystem(R, SensorManager.AXIS_MINUS_Y, SensorManager.AXIS_X, remapped)
            Surface.ROTATION_180 -> SensorManager.remapCoordinateSystem(R, SensorManager.AXIS_MINUS_X, SensorManager.AXIS_MINUS_Y, remapped)
            else -> { R.copyInto(remapped); true }  // ROTATION_0 = portrait default
        }
        val M = if (ok == true) remapped else R

        // Project the back-camera direction (device Z−) into world frame.
        // Back camera = opposite of screen normal = device (0, 0, −1)
        // camera_world = M * (0, 0, -1) → negate column 3 (indices 2, 5, 8)
        val camEast  = -M[2].toDouble()  // world East  component
        val camNorth = -M[5].toDouble()  // world North component
        val camUp    = -M[8].toDouble()  // world Up    component

        // Pitch: elevation of camera above horizon, positive = looking up (matches iOS).
        // Negate because Android ENU "up" axis is opposite to iOS CoreMotion convention.
        val pitchDeg = -Math.toDegrees(Math.asin(camUp.coerceIn(-1.0, 1.0)))

        // Yaw: compass bearing of camera direction, 0=North, 90=East (matches iOS)
        val yawDeg = Math.toDegrees(Math.atan2(camEast, camNorth))

        val params = WritableNativeMap()
        params.putDouble("yaw", yawDeg)
        params.putDouble("pitch", pitchDeg)
        params.putDouble("roll", 0.0)
        sendEvent("onAttitude", params)
    }
}
