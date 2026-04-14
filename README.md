# @sourceship/capture360

React Native panorama capture and equirectangular stitching library.

## Features

- **iOS & Android Support** — Native module implementations for both platforms
- **Linear Stitching** — Fast left-to-right frame composition (matches iOS Photos app behavior)
- **Equirectangular Projection** — Full 360° spherical projection via OpenCV
- **WebGL Viewer** — Interactive panorama display with touch controls

## Installation (Development)

For local development linking (not published to npm yet):

```bash
# In bisetka repo:
cd /path/to/bisetka
npm install file:../bisetka_photosphere react-native-webview
npx pod-install
```

This creates a symlink to the local `bisetka_photosphere` directory.

## Usage

### Capture Frames with ARCameraView

```tsx
import {ARCameraView} from '@sourceship/capture360';

const cameraRef = useRef<ARCameraViewHandle>(null);

// In your component:
<ARCameraView ref={cameraRef} onOrientationChange={handleOrientation} />

// To capture a frame:
const frames = await cameraRef.current?.captureFrame();
```

### Stitch Frames

```tsx
import {stitchImages} from '@sourceship/capture360';

const panorama = await stitchImages(frames);
```

### Display Panorama

```tsx
import {PanoramaViewer} from '@sourceship/capture360';

<PanoramaViewer uri={panorama.uri} />
```

## API Reference

See `src/index.ts` for full export list.

---

**Note:** This is a work-in-progress library. Breaking changes may occur before v1.0.
