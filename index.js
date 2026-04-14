// react-native-bisetka-photosphere — public API

// Native module functions
export {
  composeEquirect,
  stitchHorizontal,
  stitchImages,
  readFileBase64,
} from './src/modules/NativePhotosphere';
export type {EquirectShot} from './src/modules/NativePhotosphere';

export {default as VideoRecorder} from './src/modules/VideoRecorder';
export type {ExtractedFrame, ExtractFramesResult} from './src/modules/VideoRecorder';

// Components
export {default as ARCameraView} from './src/components/ARCameraView';
export type {
  OrientationEvent,
  RecordingCompleteEvent,
  ARCameraViewHandle,
} from './src/components/ARCameraView';

export {default as PanoramaViewer} from './src/components/PanoramaViewer';
export {default as SphereViewer} from './src/components/SphereViewer';
export {default as SphericalGuide} from './src/components/SphericalGuide';
export {SPHERE_POSITIONS, NUM_SPHERE_SHOTS} from './src/components/SphericalGuide';
export type {CapturePosition} from './src/components/SphericalGuide';

// Hooks
export {usePhotosphere} from './src/hooks/usePhotosphere';
export type {
  ShotEntry,
  ShotList,
  PhotosphereState,
  UsePhotosphereReturn,
} from './src/hooks/usePhotosphere';

export {useAttitude} from './src/hooks/useAttitude';
export type {Attitude} from './src/hooks/useAttitude';

export {useDeviceOrientation, orientationToRotationDeg} from './src/hooks/useDeviceOrientation';
export type {DeviceOrientation, UseDeviceOrientationReturn} from './src/hooks/useDeviceOrientation';

export {useVideoCapture, findNearestCell} from './src/hooks/useVideoCapture';
export type {VideoFrame, CoverageGrid} from './src/hooks/useVideoCapture';
