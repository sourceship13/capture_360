/**
 * JS wrapper for the native ARCameraView.
 * Shows live AR camera preview and captures frames with ARKit pose data.
 */

import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {
  requireNativeComponent,
  StyleProp,
  ViewStyle,
  NativeModules,
  findNodeHandle,
} from 'react-native';

export interface OrientationEvent {
  nativeEvent: {
    yaw: number;
    pitch: number;
    roll: number;
    capturedCount?: number;
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
      fx?: number;
      fy?: number;
      cx?: number;
      cy?: number;
      imageWidth?: number;
      imageHeight?: number;
    }>;
    sessionDir: string;
  };
}

export interface ARCameraViewHandle {
  captureFrame: () => void;
}

interface NativeProps {
  style?: StyleProp<ViewStyle>;
  isRecording?: boolean;
  onOrientationUpdate?: (event: OrientationEvent) => void;
  onRecordingComplete?: (event: RecordingCompleteEvent) => void;
}

const NativeARCameraView =
  requireNativeComponent<NativeProps>('ARCameraView');

const ARCameraViewWrapper = forwardRef<ARCameraViewHandle, NativeProps>(
  (props, ref) => {
    const nativeRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      captureFrame: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (tag != null) {
          NativeModules.ARCameraView.captureFrame(tag);
        }
      },
    }));

    return <NativeARCameraView ref={nativeRef} {...props} />;
  },
);

export default ARCameraViewWrapper;
