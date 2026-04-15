/**
 * VideoRecorder — JS wrapper for the native VideoRecorder module.
 *
 * Provides camera permission requests and video frame extraction.
 */
import {NativeModules} from 'react-native';

const {VideoRecorder} = NativeModules;

export interface ExtractedFrame {
  path: string;
  timestamp: number;
}

export interface ExtractFramesResult {
  success: boolean;
  frameCount: number;
  frames: ExtractedFrame[];
  sessionDir: string;
  duration: number;
}

export default {
  requestCameraPermission(): Promise<'granted' | 'denied'> {
    return VideoRecorder.requestCameraPermission();
  },

  extractFrames(videoPath: string, fps: number): Promise<ExtractFramesResult> {
    return VideoRecorder.extractFrames(videoPath, fps);
  },

  testModule(): Promise<{success: boolean; message: string}> {
    return VideoRecorder.testModule();
  },
};
