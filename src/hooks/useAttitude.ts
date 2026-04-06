/**
 * useAttitude — streams device orientation (yaw / pitch / roll) from
 * CMMotionManager on iOS via the NativeDeviceInfo event emitter.
 *
 * The native module sends RAW yaw/pitch (no offset). This hook captures
 * the first yaw sample as an offset so that "front" direction = 0°.
 *
 * Returns the current attitude in degrees:
 *   yaw   — rotation around vertical axis (0° = start direction, ±180°)
 *   pitch — tilt forward/back (0° = horizon, +90° = up, -90° = down)
 *   roll  — tilt left/right
 *   rawYaw — unprocessed yaw from native (for debugging)
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const {NativeDeviceInfo} = NativeModules;

export type Attitude = {
  yaw: number;   // degrees, adjusted (0° = start direction)
  pitch: number;  // degrees
  roll: number;   // degrees
  rawYaw: number; // degrees, raw from native (for debug)
  rotationMatrix?: number[]; // 9 elements: raw rotation matrix from CoreMotion
  resetYawOffset: () => void; // reset yaw offset to current rawYaw
};

export function useAttitude(active: boolean = true): Attitude {
  const [attitude, setAttitude] = useState<Attitude>({
    yaw: 0, pitch: 0, roll: 0, rawYaw: 0,
    resetYawOffset: () => {},  // placeholder, will be replaced
  });
  const yawOffsetRef = useRef<number | null>(null);
  const latestRawYawRef = useRef<number>(0);

  const resetYawOffset = useCallback(() => {
    console.log('[useAttitude] Resetting yaw offset to current position:', latestRawYawRef.current);
    yawOffsetRef.current = latestRawYawRef.current;
  }, []);

  useEffect(() => {
    if (!active || !NativeDeviceInfo) {
      return;
    }

    const emitter = new NativeEventEmitter(NativeDeviceInfo);
    // Don't reset offset here - let resetYawOffset() control it
    if (yawOffsetRef.current === null) {
      yawOffsetRef.current = 0;  // temp offset until first shot
    }

    const sub = emitter.addListener('onAttitude', (data: {yaw: number; pitch: number; roll: number; rotationMatrix?: number[]}) => {
      const rawYaw = data.yaw;
      latestRawYawRef.current = rawYaw;

      let adjustedYaw = rawYaw - yawOffsetRef.current;
      if (adjustedYaw > 180) adjustedYaw -= 360;
      if (adjustedYaw < -180) adjustedYaw += 360;

      setAttitude(prev => ({
        ...prev,
        yaw: adjustedYaw,
        pitch: data.pitch,
        roll: data.roll,
        rawYaw,
        rotationMatrix: data.rotationMatrix,
        resetYawOffset,
      }));
    });

    NativeDeviceInfo.startAttitudeUpdates();

    return () => {
      sub.remove();
      NativeDeviceInfo.stopAttitudeUpdates();
    };
  }, [active, resetYawOffset]);

  return attitude;
}
