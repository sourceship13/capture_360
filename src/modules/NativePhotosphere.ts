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

/**
 * exportCaptureZip — bundles the stitched panorama and all individual frames
 * into a .zip file saved to the app's Documents directory (visible in Files app).
 *
 * @param stitchedPath  Path to the stitched equirectangular JPEG
 * @param framePaths    Array of paths to individual captured frame JPEGs
 * @param filename      Optional base name for the zip (default: capture_<timestamp>)
 * @returns Promise resolving to the path of the created .zip file
 */
export function exportCaptureZip(
  stitchedPath: string,
  framePaths: string[],
  filename?: string,
): Promise<string> {
  return NativePhotosphere.exportCaptureZip(
    stitchedPath,
    framePaths,
    filename ?? '',
  );
}
