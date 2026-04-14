# @sourceship/capture360 Example

This is a demo app showing how to use the `@sourceship/capture360` React Native module.

## Features

- Live camera preview with AR orientation tracking
- Frame capture functionality
- Panorama viewer integration

## Running the Example App

### iOS

```bash
cd ios
pod install
npx react-native run-ios
```

### Android

```bash
npx react-native run-android
```

## Usage in Your Own Project

1. Install the module:
```bash
npm install @sourceship/capture360 react-native-webview
npx pod-install
```

2. Import and use:

```tsx
import {ARCameraView, PanoramaViewer} from '@sourceship/capture360';

// In your component:
<ARCameraView ref={cameraRef} onOrientationChange={handleOrientation} />
<PanoramaViewer uri={panoramaUri} />
```

## License

MIT
