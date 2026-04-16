package com.bisetkaphotosphere.turbomodule

import android.util.Log
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * React Native ViewManager for ARCameraView.
 *
 * Mirrors the iOS ARCameraViewManager:
 *  - prop:  isRecording
 *  - events: onOrientationUpdate, onRecordingComplete
 *  - command: captureFrame
 */
class ARCameraViewManager : SimpleViewManager<ARCameraView>() {

    companion object {
        const val REACT_CLASS = "ARCameraView"
        private const val CMD_CAPTURE_FRAME = 1
        private const val CMD_CAPTURE_FRAME_WITH_GRID = 2
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): ARCameraView {
        Log.e("ARCViewMgr", "createViewInstance called")
        return ARCameraView(context)
    }

    // ── Props ────────────────────────────────────────────────────────────

    @ReactProp(name = "isRecording")
    fun setIsRecording(view: ARCameraView, recording: Boolean) {
        view.isRecording = recording
    }

    // ── Event registration ───────────────────────────────────────────────

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put(
                "onOrientationUpdate",
                MapBuilder.of("registrationName", "onOrientationUpdate")
            )
            .put(
                "onRecordingComplete",
                MapBuilder.of("registrationName", "onRecordingComplete")
            )
            .build()
    }

    // ── Commands ─────────────────────────────────────────────────────────

    override fun getCommandsMap(): Map<String, Int>? {
        return MapBuilder.of(
            "captureFrame", CMD_CAPTURE_FRAME,
            "captureFrameWithGrid", CMD_CAPTURE_FRAME_WITH_GRID
        )
    }

    override fun receiveCommand(
        view: ARCameraView,
        commandId: String,
        args: ReadableArray?
    ) {
        when (commandId) {
            "$CMD_CAPTURE_FRAME", "captureFrame" -> view.captureFrame()
            "$CMD_CAPTURE_FRAME_WITH_GRID", "captureFrameWithGrid" -> view.captureFrame()
        }
    }
}
