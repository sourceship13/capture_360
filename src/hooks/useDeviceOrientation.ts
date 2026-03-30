import {useCallback, useRef, useState} from 'react';
import type {Orientation} from 'react-native-vision-camera';

export type DeviceOrientation = Orientation;

/**
 * Tracks the current device/preview orientation reported by VisionCamera's
 * sensor pipeline and lets you snapshot it at the exact moment of capture.
 *
 * Usage
 * ─────
 * 1. Call `onOrientationChange` from the Camera's `onPreviewOrientationChanged` prop.
 * 2. Call `snapshotOrientation()` when the shutter button is pressed.
 * 3. Read `capturedOrientation` in the preview screen to rotate the image correctly.
 *
 * Rotation table (portrait phone, rear sensor is landscape-left by default):
 *   portrait            → rotate -90° (CCW) to get correct portrait display
 *   portrait-upside-down→ rotate  90° (CW)
 *   landscape-left      → no rotation (sensor native, phone is in landscape-left)
 *   landscape-right     → rotate 180°
 */

export type UseDeviceOrientationReturn = {
  /** Feed this to the Camera component's onPreviewOrientationChanged prop. */
  onOrientationChange: (orientation: DeviceOrientation) => void;
  /** Call this inside the capture handler to freeze the orientation at shutter time. */
  snapshotOrientation: () => DeviceOrientation;
  /** The orientation frozen at the last call to snapshotOrientation(). */
  capturedOrientation: DeviceOrientation | null;
  /** Resets capturedOrientation back to null (call after retake). */
  resetOrientation: () => void;
};

export function useDeviceOrientation(): UseDeviceOrientationReturn {
  // Mutable ref so we always have the latest value without re-renders.
  const currentRef = useRef<DeviceOrientation>('portrait');
  // State only for the snapshot — drives the preview re-render.
  const [capturedOrientation, setCapturedOrientation] =
    useState<DeviceOrientation | null>(null);

  const onOrientationChange = useCallback((orientation: DeviceOrientation) => {
    currentRef.current = orientation;
  }, []);

  const snapshotOrientation = useCallback((): DeviceOrientation => {
    const snapped = currentRef.current;
    setCapturedOrientation(snapped);
    return snapped;
  }, []);

  const resetOrientation = useCallback(() => {
    setCapturedOrientation(null);
  }, []);

  return {
    onOrientationChange,
    snapshotOrientation,
    capturedOrientation,
    resetOrientation,
  };
}

/**
 * Given the orientation reported by the hook at capture time, returns
 * the CSS rotation angle string needed to make the raw sensor JPEG
 * appear upright in a React Native <Image>.
 *
 * iPhone rear sensor is physically landscape-left.
 * When the phone is held in portrait the JPEG is wider-than-tall (landscape);
 * we need -90° (CCW) to bring it upright.
 */
export function orientationToRotationDeg(
  orientation: DeviceOrientation,
): string {
  switch (orientation) {
    case 'portrait':
      return '90deg';  // sensor is landscape-left; rotate CW to correct
    case 'portrait-upside-down':
      return '-90deg'; // phone upside-down; rotate CCW
    case 'landscape-left':
      return '0deg';   // native sensor orientation; no correction
    case 'landscape-right':
      return '180deg'; // phone fully flipped; rotate 180°
    default:
      return '90deg';
  }
}
