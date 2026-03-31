import {useCallback, useState} from 'react';
import {NUM_SPHERE_SHOTS} from '../components/SphericalGuide';
import {composeEquirect} from '../modules/NativePhotosphere';

/** Total number of shots in one photosphere session. */
export const NUM_SHOTS = NUM_SPHERE_SHOTS;

/** Each capture stores the image path plus the sensor orientation at capture time. */
export type ShotEntry = {
  path: string;
  yaw: number;   // sensor yaw (degrees) at capture
  pitch: number; // sensor pitch (degrees) at capture
};

/**
 * Maps position ID -> shot data (path + orientation).
 * Allows captures in any order.
 */
export type ShotMap = Map<number, ShotEntry>;

const CAMERA_HFOV = 55;
const CAMERA_VFOV = 70;

export type PhotosphereState =
  | {status: 'idle'}
  | {status: 'capturing'; shotMap: ShotMap}
  | {status: 'composing'}
  | {status: 'done'; equirectPath: string}
  | {status: 'error'; message: string};

export type UsePhotosphereReturn = {
  state: PhotosphereState;
  startCapture: () => void;
  addShot: (positionId: number, path: string, yaw: number, pitch: number) => void;
  removeShot: (positionId: number) => void;
  compose: (shotMap: ShotMap) => void;
  reset: () => void;
};

export function usePhotosphere(): UsePhotosphereReturn {
  const [state, setState] = useState<PhotosphereState>({status: 'idle'});

  const startCapture = useCallback(() => {
    setState({status: 'capturing', shotMap: new Map()});
  }, []);

  const addShot = useCallback(
    (positionId: number, path: string, yaw: number, pitch: number) => {
      setState(prev => {
        if (prev.status !== 'capturing') return prev;
        const next = new Map(prev.shotMap);
        next.set(positionId, {path, yaw, pitch});
        return {...prev, shotMap: next};
      });
    },
    [],
  );

  const removeShot = useCallback((positionId: number) => {
    setState(prev => {
      if (prev.status !== 'capturing') return prev;
      const next = new Map(prev.shotMap);
      next.delete(positionId);
      return {...prev, shotMap: next};
    });
  }, []);

  const compose = useCallback(async (shotMap: ShotMap) => {
    if (shotMap.size === 0) return;
    setState({status: 'composing'});
    try {
      const shots = [...shotMap.values()].map(entry => ({
        path: entry.path,
        yaw: entry.yaw,
        pitch: entry.pitch,
        hFov: CAMERA_HFOV,
        vFov: CAMERA_VFOV,
      }));
      const equirectPath = await composeEquirect(shots);
      setState({status: 'done', equirectPath});
    } catch (e: any) {
      setState({status: 'error', message: e.message ?? 'Composing failed'});
    }
  }, []);

  const reset = useCallback(() => {
    setState({status: 'idle'});
  }, []);

  return {state, startCapture, addShot, removeShot, compose, reset};
}
