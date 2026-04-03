import {useCallback, useState} from 'react';
import {composeEquirect} from '../modules/NativePhotosphere';

/** Each capture stores the image path plus the sensor orientation at capture time. */
export type ShotEntry = {
  path: string;
  yaw: number;   // sensor yaw (degrees) at capture
  pitch: number; // sensor pitch (degrees) at capture
};

/** Simple array of shots — no position IDs, just orientation-tagged photos. */
export type ShotList = ShotEntry[];

const CAMERA_HFOV = 55;
const CAMERA_VFOV = 70;

export type PhotosphereState =
  | {status: 'idle'}
  | {status: 'capturing'; shots: ShotList}
  | {status: 'composing'}
  | {status: 'done'; equirectPath: string}
  | {status: 'error'; message: string};

export type UsePhotosphereReturn = {
  state: PhotosphereState;
  startCapture: () => void;
  addShot: (path: string, yaw: number, pitch: number) => void;
  undoLastShot: () => void;
  compose: (shots: ShotList, cameraHFov?: number, cameraVFov?: number) => void;
  reset: () => void;
};

export function usePhotosphere(): UsePhotosphereReturn {
  const [state, setState] = useState<PhotosphereState>({status: 'idle'});

  const startCapture = useCallback(() => {
    setState({status: 'capturing', shots: []});
  }, []);

  const addShot = useCallback(
    (path: string, yaw: number, pitch: number) => {
      // yaw/pitch are already in degrees from useAttitude
      console.log(`[addShot] Storing shot at yaw=${yaw.toFixed(1)}° pitch=${pitch.toFixed(1)}°`);
      setState(prev => {
        if (prev.status !== 'capturing') return prev;
        const newShot = {path, yaw, pitch};
        console.log(`[addShot] Total shots: ${prev.shots.length + 1}`);
        return {...prev, shots: [...prev.shots, newShot]};
      });
    },
    [],
  );

  const undoLastShot = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'capturing' || prev.shots.length === 0) return prev;
      return {...prev, shots: prev.shots.slice(0, -1)};
    });
  }, []);

  const compose = useCallback(async (shots: ShotList, cameraHFov?: number, cameraVFov?: number) => {
    if (shots.length === 0) return;
    setState({status: 'composing'});
    try {
      const shotHFov = cameraHFov ?? CAMERA_HFOV;
      const shotVFov = cameraVFov ?? CAMERA_VFOV;
      const nativeShots = shots.map(entry => ({
        path: entry.path,
        yaw: entry.yaw,
        pitch: entry.pitch,
        hFov: shotHFov,
        vFov: shotVFov,
      }));
      const equirectPath = await composeEquirect(nativeShots);
      setState({status: 'done', equirectPath});
    } catch (e: any) {
      setState({status: 'error', message: e.message ?? 'Composing failed'});
    }
  }, []);

  const reset = useCallback(() => {
    setState({status: 'idle'});
  }, []);

  return {state, startCapture, addShot, undoLastShot, compose, reset};
}
