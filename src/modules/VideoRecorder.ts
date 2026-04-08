/**
 * Native video utility module — frame extraction + camera permissions.
 * Camera preview handled by native ARCameraView.
 */

import {NativeModules} from 'react-native';

interface ExtractedFrame {
  path: string;
  timestamp: number;
}

interface ExtractFramesResult {
  success: boolean;
  frameCount: number;
  frames: ExtractedFrame[];
  sessionDir: string;
  duration: number;
}

interface VideoRecorderModule {
  extractFrames(videoPath: string, fps: number): Promise<ExtractFramesResult>;
  requestCameraPermission(): Promise<'granted' | 'denied'>;
  testModule(): Promise<{success: boolean; message: string}>;
}

console.log('[VideoRecorder] Available modules:', Object.keys(NativeModules).filter(k => k.includes('Video') || k.includes('Record')));

const {VideoRecorder} = NativeModules;

if (!VideoRecorder) {
  console.error('[VideoRecorder] Module not found. All modules:', Object.keys(NativeModules));
  throw new Error('VideoRecorder native module not found');
}

export default VideoRecorder as VideoRecorderModule;
export type {ExtractedFrame, ExtractFramesResult};
