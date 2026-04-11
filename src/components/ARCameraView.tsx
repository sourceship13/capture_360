/**
 * JS wrapper for the native ARCameraView.
 * Shows live AR camera preview and captures frames with ARKit pose data.
 */

import React from 'react';
import {requireNativeComponent, StyleProp, ViewStyle} from 'react-native';

export interface OrientationEvent {
  nativeEvent: {
    yaw: number;
    pitch: number;
    roll: number;
    timestamp: number;
  };
}

export interface RecordingCompleteEvent {
  nativeEvent: {
    frameCount: number;
    frames: Array<{
      path: string;
      yaw: number;
      pitch: number;
      roll: number;
      hFov: number;
      timestamp: number;
    }>;
    sessionDir: string;
  };
}

interface NativeProps {
  style?: StyleProp<ViewStyle>;
  isRecording?: boolean;
  onOrientationUpdate?: (event: OrientationEvent) => void;
  onRecordingComplete?: (event: RecordingCompleteEvent) => void;
}

const NativeARCameraView =
  requireNativeComponent<NativeProps>('ARCameraView');

export default NativeARCameraView;
