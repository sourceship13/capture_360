/**
 * NativePhotosphere — JS wrapper around the NativePhotosphere TurboModule.
 *
 * Exposes composeEquirect, stitchImages, stitchHorizontal, and readFileBase64.
 */
import {NativeModules} from 'react-native';

const {NativePhotosphere} = NativeModules;

export interface EquirectShot {
  path: string;
  yaw: number;
  pitch: number;
  hFov: number;
  vFov?: number;
  rotationMatrix?: number[] | null;
  fx?: number;
  fy?: number;
  cx?: number;
  cy?: number;
  imageWidth?: number;
  imageHeight?: number;
  gridRow?: number;
  gridCol?: number;
  targetYaw?: number;
  targetPitch?: number;
}

export function composeEquirect(shots: EquirectShot[]): Promise<string> {
  return NativePhotosphere.composeEquirect(shots);
}

export function stitchImages(imagePaths: string[]): Promise<string> {
  return NativePhotosphere.stitchImages(imagePaths);
}

export function stitchHorizontal(imagePaths: string[]): Promise<string> {
  return NativePhotosphere.stitchImages(imagePaths);
}

export function readFileBase64(filePath: string): Promise<string> {
  return NativePhotosphere.readFileBase64(filePath);
}
