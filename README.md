# @sera/capture360

React Native panorama capture and equirectangular stitching library powered by OpenCV.

## Features

- **iOS** — OpenCV 4.10 xcframework built from source (stitching, imgproc, calib3d only — stripped to ~40 MB)
- **Android** — OpenCV 4.10 via Maven (`org.opencv:opencv:4.10.0`)
- **Equirectangular Projection** — Full 360° spherical projection via pinhole → equirect warping
- **ARKit Camera Intrinsics** — Per-frame `fx/fy/cx/cy` for accurate projection
- **WebGL Sphere Viewer** — Interactive panorama display with touch/gyro controls
- **Video Frame Extraction** — Record video, extract frames, stitch automatically

## Installation

### 1. Configure your private registry

Create or update `.npmrc` in your consuming project root:

```ini
@sera:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 2. Install

```bash
npm install @sera/capture360 react-native-webview
```

### 3. iOS — Build OpenCV framework

The podspec's `prepare_command` builds OpenCV from source on first `pod install`.
This takes ~15 minutes on first run (cached after that).

**Prerequisites:** `cmake`, `python3`, Xcode Command Line Tools.

```bash
cd ios && pod install
```

To build it manually ahead of time:
```bash
npx @sera/capture360 setup:ios
# or directly:
bash node_modules/@sera/capture360/scripts/download-opencv-ios.sh
```

### 4. Android

OpenCV is pulled from Maven automatically — no extra setup needed.

## Usage

### Capture Frames with ARCameraView

```tsx
import {ARCameraView} from '@sera/capture360';
import type {ARCameraViewHandle} from '@sera/capture360';

const cameraRef = useRef<ARCameraViewHandle>(null);

<ARCameraView ref={cameraRef} onOrientationChange={handleOrientation} />

const frame = await cameraRef.current?.captureFrame();
```

### Stitch to Equirectangular

```tsx
import {composeEquirect} from '@sera/capture360';
import type {EquirectShot} from '@sera/capture360';

const equirectPath = await composeEquirect(shots);
```

### Display Panorama

```tsx
import {PanoramaViewer} from '@sera/capture360';

<PanoramaViewer uri={equirectPath} />
```

### Video Capture + Frame Extraction

```tsx
import {VideoRecorder} from '@sera/capture360';

await VideoRecorder.requestCameraPermission();
const result = await VideoRecorder.extractFrames(videoPath, 2); // 2 fps
```

## API Reference

See [src/index.ts](src/index.ts) for full export list.

### Native Modules
- `composeEquirect(shots)` — Warp frames to equirectangular canvas using per-frame camera intrinsics
- `stitchImages(paths)` — OpenCV Stitcher-based panorama (automatic feature matching)
- `readFileBase64(path)` — Read file as base64 string

### Components
- `ARCameraView` — Camera preview with ARKit orientation tracking (iOS) / CameraX (Android)
- `PanoramaViewer` — WebGL equirectangular sphere viewer
- `SphereViewer` — Lightweight sphere renderer
- `SphericalGuide` — Capture position guide overlay

### Hooks
- `usePhotosphere()` — Full capture workflow state machine
- `useAttitude()` — Device attitude (quaternion/euler)
- `useDeviceOrientation()` — Portrait/landscape detection
- `useVideoCapture()` — Video-based capture with coverage grid

## OpenCV Modules Included (iOS)

The build script strips OpenCV to only what's needed:

| Included | Excluded |
|----------|----------|
| core | objdetect |
| imgproc | dnn |
| imgcodecs | ml |
| calib3d | photo |
| features2d | video |
| stitching | videoio |
| flann | highgui |
| | gapi |

## Publishing

```bash
# Build TypeScript
npm run prepare

# Dry-run to check package contents
npm pack --dry-run

# Publish to GitHub Packages
npm publish
```
