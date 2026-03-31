/**
 * useAttitude — streams device orientation (yaw / pitch / roll) from
 * CMMotionManager on iOS via the NativeDeviceInfo event emitter.
 *
 * Returns the current attitude in degrees:
 *   yaw   — rotation around vertical axis (0° at start, ±180°)
 *   pitch — tilt forward/back (0° = horizon, +90° = up, -90° = down)
 *   roll  — tilt left/right
 */
import {useEffect, useRef, useState} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const {NativeDeviceInfo} = NativeModules;

export type Attitude = {
  yaw: number;   // degrees
  pitch: number;  // degrees
  roll: number;   // degrees
  rotationMatrix?: number[]; // 9 elements: yaw-offset-adjusted rotation matrix
};

export function useAttitude(active: boolean = true): Attitude {
  const [attitude, setAttitude] = useState<Attitude>({yaw: 0, pitch: 0, roll: 0});
  const emitterRef = useRef<NativeEventEmitter | null>(null);

  useEffect(() => {
    if (!active || !NativeDeviceInfo) {
      return;
    }

    if (!emitterRef.current) {
      emitterRef.current = new NativeEventEmitter(NativeDeviceInfo);
    }

    const sub = emitterRef.current.addListener('onAttitude', (data: Attitude) => {
      setAttitude(data);
    });

    NativeDeviceInfo.startAttitudeUpdates();

    return () => {
      sub.remove();
      NativeDeviceInfo.stopAttitudeUpdates();
    };
  }, [active]);

  return attitude;
}
