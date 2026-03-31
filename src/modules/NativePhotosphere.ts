import {NativeModules} from 'react-native';

const {NativePhotosphere} = NativeModules;

if (!NativePhotosphere) {
  throw new Error(
    'NativePhotosphere native module is not linked. Run a clean native build.',
  );
}

console.log(
  '[NativePhotosphere] available methods:',
  Object.keys(NativePhotosphere),
);

export type EquirectShot = {
  path: string;
  yaw: number;
  pitch: number;
  hFov: number;
  vFov: number;
};

/**
 * Composes captured photos onto a 2:1 equirectangular canvas.
 * Uncaptured areas remain black.
 */
export function composeEquirect(shots: EquirectShot[]): Promise<string> {
  console.log('[NativePhotosphere] composeEquirect type:', typeof NativePhotosphere.composeEquirect);
  if (typeof NativePhotosphere.composeEquirect !== 'function') {
    return Promise.reject(
      new Error(
        'composeEquirect is not available on NativePhotosphere. ' +
        'Available: ' + Object.keys(NativePhotosphere).join(', ') +
        '. You must do a clean native rebuild.',
      ),
    );
  }
  return NativePhotosphere.composeEquirect(shots);
}

/**
 * Stitches an ordered list of image file paths into a panoramic JPEG
 * using the platform's native stitching engine.
 */
export function stitchImages(paths: string[]): Promise<string> {
  return NativePhotosphere.stitchImages(paths);
}

/**
 * Reads a file from disk and returns its content as a base64-encoded string.
 */
export function readFileBase64(filePath: string): Promise<string> {
  return NativePhotosphere.readFileBase64(filePath);
}
