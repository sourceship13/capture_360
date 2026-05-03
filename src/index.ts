// capture360 — public API

// Native module functions
export {
  composeEquirect,
  stitchHorizontal,
  stitchImages,
  readFileBase64,
  exportCaptureZip,
  shareFile,
} from './modules/NativePhotosphere';
export type {EquirectShot} from './modules/NativePhotosphere';

export {default as VideoRecorder} from './modules/VideoRecorder';
export type {ExtractedFrame, ExtractFramesResult} from './modules/VideoRecorder';

// Components
export {default as ARCameraView} from './components/ARCameraView';
export type {
  OrientationEvent,
  RecordingCompleteEvent,
  ARCameraViewHandle,
} from './components/ARCameraView';

export {default as PanoramaViewer} from './components/PanoramaViewer';
export {default as SphereViewer} from './components/SphereViewer';
export type {SphereViewerHandle} from './components/SphereViewer';
export {default as SphericalGuide} from './components/SphericalGuide';
export {SPHERE_POSITIONS, NUM_SPHERE_SHOTS} from './components/SphericalGuide';
export type {CapturePosition} from './components/SphericalGuide';

// Hooks
export {usePhotosphere} from './hooks/usePhotosphere';
export type {
  ShotEntry,
  ShotList,
  PhotosphereState,
  UsePhotosphereReturn,
} from './hooks/usePhotosphere';

export {useAttitude} from './hooks/useAttitude';
export type {Attitude} from './hooks/useAttitude';

export {useDeviceOrientation, orientationToRotationDeg} from './hooks/useDeviceOrientation';
export type {DeviceOrientation, UseDeviceOrientationReturn} from './hooks/useDeviceOrientation';

export {useVideoCapture, findNearestCell} from './hooks/useVideoCapture';
export type {VideoFrame, CoverageGrid} from './hooks/useVideoCapture';
