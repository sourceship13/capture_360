# 📸 Capture360

> Professional panorama capture and equirectangular stitching for React Native. Create stunning 360° photospheres and panoramic video with native performance on iOS and Android.

[![npm version](https://img.shields.io/npm/v/@sourceship13/react-native-capture360.svg?style=flat-square)](https://www.npmjs.com/package/@sourceship13/react-native-capture360)
[![npm downloads](https://img.shields.io/npm/dm/@sourceship13/react-native-capture360.svg?style=flat-square)](https://www.npmjs.com/package/@sourceship13/react-native-capture360)
[![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)

## ✨ Features

- **📱 Native Performance** - Leverages OpenCV (iOS) and native Android APIs for high-performance image stitching
- **🎥 Dual Capture Modes** - Panorama photo captures and 360° video recording
- **🧭 Gyroscope Support** - Intelligent gyro-based orientation tracking for seamless capture
- **⚙️ Equirectangular Stitching** - Automatic conversion to standard 360° projection
- **🎨 Interactive Sphere Viewer** - Built-in viewer with gyro-based pan navigation
- **📦 Export Ready** - Zip all frames and assets for distribution
- **⚡ TypeScript** - Full type safety out of the box
- **🔄 Cross-Platform** - Consistent API on iOS and Android

## 🎯 Use Cases

- Real estate virtual tours
- Product showcase galleries
- 360° event coverage
- Educational content
- Gaming environment capture
- Social media content (Instagram, Facebook)

## 📋 Requirements

- **React Native** >= 0.73.0
- **iOS** >= 12.0 (with OpenCV via CocoaPods)
- **Android** >= API 21
- **Node.js** >= 20.0

## 🚀 Quick Start

### Installation

See [INSTALLATION.md](INSTALLATION.md) for detailed platform-specific setup.

```bash
# npm
npm install @sourceship13/react-native-capture360

# yarn
yarn add @sourceship13/react-native-capture360
```

Install peer dependencies:

```bash
# npm
npm install react-native-webview react-native-vision-camera

# yarn
yarn add react-native-webview react-native-vision-camera
```

**iOS** — download the OpenCV framework and install pods:

```bash
# Download OpenCV (~200MB, required for iOS builds)
npm run setup:ios
# or with yarn:
yarn setup:ios

# Then install pods
cd ios && pod install && cd ..
```

> `setup:ios` downloads `opencv2.framework` into `ios/`. Skip this step if targeting Android only. See [INSTALLATION.md](INSTALLATION.md) for manual setup and troubleshooting.

### Basic Usage

#### Capture Panorama

```tsx
import { ARCameraView } from '@sourceship13/react-native-capture360';
import { useRef } from 'react';

export function PanoramaCapture() {
  const cameraRef = useRef(null);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const imagePath = await cameraRef.current.captureFrame();
    console.log('Captured frame:', imagePath);
  };

  return (
    <>
      <ARCameraView
        ref={cameraRef}
        style={{ flex: 1 }}
      />
      <Button onPress={handleCapture} title="Capture Frame" />
    </>
  );
}
```

#### View Photosphere

```tsx
import { SphereViewer } from '@sourceship13/react-native-capture360';

export function PanoramaViewer() {
  return (
    <SphereViewer
      source={require('./panorama.jpg')}
      enableGyro={true}
      style={{ flex: 1 }}
    />
  );
}
```
<!-- 
#### Record 360° Video

```tsx
import { useVideoCapture } from '@sourceship13/react-native-capture360';

export function VideoCapture() {
  const { startRecording, stopRecording, isRecording } = useVideoCapture();

  return (
    <>
      <ARCameraView style={{ flex: 1 }} />
      <Button
        onPress={isRecording ? stopRecording : startRecording}
        title={isRecording ? 'Stop' : 'Record'}
      />
    </>
  );
}
``` -->

## 📚 API Reference

### Components

#### `ARCameraView`

Native AR camera view for capturing panorama frames.

**Props:**
- `style?: ViewStyle` - Container styles
- `faceDetection?: boolean` - Enable face detection (default: true)
- `frameRate?: 30 | 60` - Capture frame rate (default: 30)

**Methods:**
- `captureFrame(): Promise<string>` - Capture single frame, returns file path
- `captureMultiple(count: number): Promise<string[]>` - Capture multiple frames
- `reset(): Promise<void>` - Reset capture state

#### `SphereViewer`

Interactive 360° photosphere viewer.

**Props:**
- `source: ImageSourcePropType` - Image source (local or URI)
- `enableGyro?: boolean` - Use device gyroscope (default: true)
- `enablePan?: boolean` - Allow manual pan (default: true)
- `initialPitch?: number` - Initial vertical angle (-90 to 90)
- `initialYaw?: number` - Initial horizontal angle (0 to 360)
- `style?: ViewStyle` - Container styles

**Methods:**
- `setPitch(value: number): void` - Set vertical viewing angle
- `setYaw(value: number): void` - Set horizontal viewing angle
- `injectAttitudeData(data: AttitudeData): void` - Feed custom gyro data

#### `PanoramaViewer`

Higher-level component combining capture + stitching + viewing.

**Props:**
- `frames: string[]` - Array of frame file paths
- `outputPath?: string` - Where to save stitched panorama
- `onProgress?: (progress: number) => void` - Stitching progress callback
- `onComplete?: (panoramaPath: string) => void` - Called when stitching done

### Hooks

#### `useAttitude()`

Subscribe to device orientation/gyroscope data.

```tsx
const { heading, pitch, roll, attitude } = useAttitude();
```

#### `useDeviceOrientation()`

Track device rotation and orientation changes.

```tsx
const { isPortrait, isLandscape, orientation } = useDeviceOrientation();
```

#### `usePhotosphere()`

Manage photosphere stitching and processing.

```tsx
const { stitch, isStitching, progress, error } = usePhotosphere();
const panorama = await stitch(frames);
```

#### `useVideoCapture()`

Control 360° video recording.

```tsx
const { 
  startRecording, 
  stopRecording, 
  isRecording, 
  videoPath 
} = useVideoCapture();
```

## 🔧 Configuration

### iOS

Run `npm run setup:ios` to download the OpenCV framework (~200MB). This is required before building on iOS. For manual setup, see [INSTALLATION.md](INSTALLATION.md#ios-setup).

### Android

Gradle is pre-configured in `android/build.gradle`. Ensure `minSdkVersion >= 21`.

## 🎨 Advanced Usage

### Custom Stitching Parameters

```tsx
import { usePhotosphere } from '@sourceship13/react-native-capture360';

const { stitch } = usePhotosphere();

const panorama = await stitch(frames, {
  overlapPercentage: 30,
  blendingMethod: 'multiband',
  imageScale: 0.5, // Reduce for faster processing
});
```

### Inject External Gyro Data

```tsx
const sphereViewerRef = useRef(null);

// From external sensor or custom algorithm
const customAttitude = {
  pitch: 15,
  yaw: 45,
  roll: 0,
  timestamp: Date.now(),
};

sphereViewerRef.current?.injectAttitudeData(customAttitude);
```

### Export with Asset Zip

```tsx
import { exportCaptureZip } from '@sourceship13/react-native-capture360';

const zipPath = await exportCaptureZip({
  panoramaPath: '/path/to/panorama.jpg',
  frames: framePaths,
  metadata: { location: 'Times Square', date: new Date() },
});

// Share the zip
shareFile(zipPath);
```

## 🐛 Troubleshooting

### OpenCV download fails on iOS

- Ensure internet connection
- Check `scripts/download-opencv-ios.sh` runs without errors
- Manually download from [OpenCV releases](https://github.com/opencv/opencv/releases)
- Place in `ios/opencv2.framework`

### Android crash on capture

- Verify `targetSdkVersion >= 28`
- Check camera permissions are granted at runtime
- Ensure sufficient free disk space (panoramas need 100-500MB)

### Gyroscope not working

- Test with `useAttitude()` hook directly
- Ensure device motion permissions granted
- Some emulators don't report gyro data—test on real device

### Memory issues with large frames

- Reduce frame resolution via `ARCameraView` `scale` prop
- Downsample images before stitching
- Use `imageScale` parameter in stitching options

## 📦 Example App

Run the included example to see Capture360 in action:

```bash
cd example

# iOS
npm run ios

# Android
npm run android
```

Example covers:
- Panorama capture workflow
- Video recording
- Photosphere viewing
- Export and sharing

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

```bash
# Install dependencies
npm install

# Lint and type-check
npm run lint

# Build library
npm run prepare

# Run example (iOS)
cd example && npm run ios
```

## 📄 License

MIT © 2026 Sourceship13. See [LICENSE](LICENSE) for details.

---

## Support

- 📖 [Full Documentation](INSTALLATION.md)
- 🐛 [Report Issues](https://github.com/sourceship13/capture360/issues)
- 💬 [Discussions](https://github.com/sourceship13/capture360/discussions)
- ⭐ Star this repo if you find it useful!

**Made with ❤️ by Sourceship13**
