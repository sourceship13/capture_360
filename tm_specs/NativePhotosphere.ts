import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Composes captured photos onto a 2:1 equirectangular canvas.
   * Each shot includes the image path and the camera orientation at capture.
   * Uncaptured areas remain black.
   *
   * @param shots - Array of {path, yaw, pitch, hFov, vFov} objects.
   * @returns Absolute path of the output equirectangular JPEG.
   */
  composeEquirect(shots: Object[]): Promise<string>;

  /**
   * Stitches an ordered array of image file paths into a single panoramic
   * JPEG using OpenCV (Android) or CoreGraphics (iOS).
   *
   * @param imagePaths - Absolute file paths, minimum 2 images required.
   * @returns Absolute path of the output panorama JPEG.
   */
  stitchImages(imagePaths: string[]): Promise<string>;

  /**
   * Reads a file from disk and returns its contents as a base64-encoded string.
   * Used to pass the stitched panorama into the WebView-based sphere viewer.
   *
   * @param filePath - Absolute file path (may have file:// prefix).
   * @returns Base64-encoded file contents.
   */
  readFileBase64(filePath: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePhotosphere');
