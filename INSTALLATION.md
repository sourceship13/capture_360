# Installation Guide

Complete platform-specific setup instructions for Capture360.

**Table of Contents:**
- [General Setup](#general-setup)
- [iOS Setup](#ios-setup)
- [Android Setup](#android-setup)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## General Setup

### Prerequisites

Ensure you have:
- React Native >= 0.73.0
- Node.js >= 20.0
- npm or yarn
- iOS: Xcode 14+ (for iOS 12+)
- Android: Android SDK 21+ (API level 21+)

### Step 1: Install via npm

```bash
npm install @sourceship13/react-native-capture360
```

Or with yarn:

```bash
yarn add @sourceship13/react-native-capture360
```

### Step 2: Link Peer Dependencies

Ensure you also have these installed:

```bash
npm install react-native-webview react-native-vision-camera
```

**Note:** If using Expo, some native features may require a bare React Native setup.

---

## iOS Setup

### Overview

Capture360 requires:
1. **OpenCV 4.8+** (downloaded automatically or manually)
2. **Cocoapods** for dependency management
3. **Xcode** build configuration

### Automatic Setup (Recommended)

The package includes an automated setup script:

```bash
cd ios && pod install && cd ..
```

This runs the `postinstall` script which:
- Downloads OpenCV (if not already present)
- Extracts it to `ios/opencv2.framework`
- Registers native modules with React Native

### Step-by-Step Manual Setup

If the automatic script fails, follow these steps:

#### 1. Install Dependencies via CocoaPods

```bash
cd ios
pod install
cd ..
```

This installs:
- `React` core
- `react-native-webview`
- `react-native-vision-camera`

#### 2. Download OpenCV

```bash
bash scripts/download-opencv-ios.sh
```

**What this does:**
- Downloads OpenCV 4.8.1 framework from the official release
- Extracts to `ios/opencv2.framework/` (~250MB uncompressed)
- Modular build with camera, imgproc, and stitching modules

**Manual alternative** (if script fails):

1. Download from: [OpenCV iOS Releases](https://github.com/opencv/opencv/releases)
2. Extract the `.framework` file to `ios/opencv2.framework/`
3. Open `ios/Capture360.xcworkspace` (not `.xcodeproj`!)
4. In Xcode: Project > Build Phases > Link Binary with Libraries
5. Add `opencv2.framework`

#### 3. Verify Xcode Integration

Open the workspace:

```bash
cd ios
open Capture360.xcworkspace
cd ..
```

**In Xcode, verify:**
- Project: `Capture360`
- Target: `Capture360`
- Build Phases > Link Binary includes:
  - `opencv2.framework`
  - `CoreMotion.framework` (gyroscope)
  - `CoreLocation.framework` (optional, for location tagging)
  - `ImageIO.framework` (image processing)

#### 4. Build Settings

Xcode should auto-configure, but verify:

1. Select `Capture360` target
2. Build Settings tab
3. Search for `Framework Search Paths`
4. Should include: `$(PROJECT_DIR)/opencv2.framework`
5. Search for `Header Search Paths`
6. Should include: `$(SRCROOT)/Capture360/**`

#### 5. Build Test

```bash
cd ios
xcodebuild -scheme Capture360 -configuration Release clean build
cd ..
```

If successful, you'll see `Build complete!`

### iOS 12+ Compatibility

iOS minimum deployment target is **12.0**. Verify in Xcode:

1. Project settings > Deployment Info
2. Minimum Deployment Target: 12.0+

---

## Android Setup

### Overview

Capture360 uses:
1. **Android SDK 21+** (minSdkVersion)
2. **Gradle** build system with OpenCV module
3. **Java/Kotlin** native modules

### Step 1: Create `local.properties`

```bash
cd android
echo "sdk.dir=$ANDROID_SDK_ROOT" > local.properties
cd ..
```

If `$ANDROID_SDK_ROOT` is not set, find your SDK path and set it manually:

```bash
cd android
echo "sdk.dir=/path/to/your/android/sdk" > local.properties
cd ..
```

**Find your SDK path:**

**On macOS/Linux:**
```bash
echo $ANDROID_SDK_ROOT
```

**Via Android Studio:**
1. Open Android Studio
2. Go to Preferences > Appearance & Behavior > System Settings > Android SDK
3. Note the SDK Location path at the top
4. Use that path in `local.properties`:
   ```bash
   echo "sdk.dir=/your/sdk/location" > android/local.properties
   ```

### Step 2: Gradle Configuration

The `android/build.gradle` is pre-configured. Verify:

```gradle
android {
  compileSdkVersion 34
  minSdkVersion 21
  targetSdkVersion 34
  
  buildFeatures {
    camera: true
    stitching: true
  }
}
```

No manual changes needed unless you have custom build requirements.

### Step 3: Build Test

```bash
cd android
./gradlew clean build
cd ..
```

Expected output: `BUILD SUCCESSFUL`

**If build fails:**
- Ensure Gradle daemon is not stuck: `./gradlew --stop`
- Clear cache: `./gradlew clean`
- Update gradle wrapper: `./gradlew wrapper --gradle-version=8.5`

### Step 4: OpenCV for Android

OpenCV is bundled. No separate download needed.

If you want to verify the version:

```bash
grep -r "opencv-android" android/
```

Should show version 4.8.0+

---

## Verify Installation

### Check Files

Verify all required files are present:

```bash
# iOS
ls -la ios/Capture360/
ls -la ios/opencv2.framework/Headers/ | head -5

# Android
ls -la android/src/main/java/com/capture360/

# TypeScript
ls -la src/
```

### Test Import

Create a simple test file:

```tsx
// test-import.tsx
import { ARCameraView, SphereViewer } from '@sourceship13/react-native-capture360';
import { useAttitude, useVideoCapture } from '@sourceship13/react-native-capture360';

console.log('✅ All imports successful');
```

Run TypeScript check:

```bash
npx tsc --noEmit test-import.tsx
```

### Run Example App

The quickest verification is running the example:

```bash
cd example
npm install  # If first time
npm run ios    # or: npm run android
```

You should see:
- Camera view live feed
- Capture buttons responsive
- Panorama viewer loading spheres
- No console errors

---

## Environment-Specific Notes

### macOS M1/M2 (Apple Silicon)

**iOS:**
- Xcode handles ARM64 natively ✅
- OpenCV framework includes arm64 slice ✅

**Android:**
- Android Studio ARM support: ✅
- Emulator on Apple Silicon: ✅ (native, not Rosetta)

No special configuration needed.

### Windows

Not officially supported (iOS requires macOS/Xcode).

For Android development on Windows:
```bash
# Set ANDROID_SDK_ROOT environment variable
setx ANDROID_SDK_ROOT "C:\Android\sdk"

# Then run gradle
cd android
.\gradlew.bat build
```

### Linux

Not officially tested. iOS development requires macOS.

Android development should work:
```bash
cd android
./gradlew build
```

---

## Post-Installation

### Link to Your App

In your React Native app's `package.json`:

```json
{
  "dependencies": {
    "@sourceship13/react-native-capture360": "^1.0.10",
    "react": "^18.0.0",
    "react-native": "^0.73.0",
    "react-native-webview": "^13.0.0",
    "react-native-vision-camera": "^4.7.0"
  }
}
```

### Add Permissions

#### iOS (`Info.plist`)

```xml
<dict>
  <key>NSCameraUsageDescription</key>
  <string>We need camera access to capture panoramas</string>
  <key>NSMotionUsageDescription</key>
  <string>We need gyroscope access for panorama navigation</string>
  <key>NSLocationWhenInUseUsageDescription</key>
  <string>Optional: location tagging for panoramas</string>
</dict>
```

#### Android (`AndroidManifest.xml`)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />

<!-- Camera hardware feature required -->
<uses-feature
  android:name="android.hardware.camera"
  android:required="true" />
<uses-feature
  android:name="android.hardware.camera.autofocus"
  android:required="false" />
```

### Request Runtime Permissions

```tsx
import { requestMultiple, PERMISSIONS, RESULTS } from 'react-native-permissions';

const requestCameraPermission = async () => {
  const result = await requestMultiple([
    PERMISSIONS.IOS.CAMERA,
    PERMISSIONS.IOS.MOTION,
    PERMISSIONS.ANDROID.CAMERA,
  ]);
  
  return result[PERMISSIONS.IOS.CAMERA] === RESULTS.GRANTED;
};
```

---

## Troubleshooting

### iOS Issues

#### Pod install fails with "Unable to find a specification"

```bash
# Update CocoaPods spec repository
pod repo update

# Then retry
cd ios && pod install && cd ..
```

#### OpenCV download script fails

**Error:** `curl: (7) Failed to connect to github.com`

**Solution:**
1. Check internet connection
2. Try manual download: https://github.com/opencv/opencv/releases/tag/4.8.1
3. Extract to `ios/opencv2.framework/`
4. Run `cd ios && pod install && cd ..`

#### Xcode build error: "opencv2 not found"

**Solution:**
1. Clean build folder: `Cmd+Shift+K`
2. Delete Pods folder: `rm -rf ios/Pods`
3. Reinstall: `cd ios && pod install && cd ..`
4. Rebuild: `Cmd+B`

#### CocoaPods version conflict

```bash
# Upgrade CocoaPods
gem install cocoapods

# Verify version
pod --version  # Should be 1.11+
```

### Android Issues

#### Gradle build fails: "minSdkVersion 21"

Ensure your app's `build.gradle` matches:

```gradle
android {
  minSdkVersion 21
  targetSdkVersion 34
}
```

#### Gradle daemon hangs

```bash
./gradlew --stop
./gradlew clean build
```

#### "Task ':app:compileDebugJavaWithJavac' failed"

Usually a Java version mismatch. Ensure:

```bash
java -version  # Should be 11 or 17
```

Update `gradle.properties`:

```properties
org.gradle.java.home=/path/to/your/jdk/installation
```

**To find your JDK path:**
- macOS: `/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home`
- Linux: `/usr/lib/jvm/java-17-openjdk`
- Windows: `C:\Program Files\Java\jdk-17`

### General Issues

#### Build succeeds but app crashes

1. Check Android logcat: `adb logcat | grep capture360`
2. Check iOS console: Xcode > Window > Devices and Simulators
3. Ensure all permissions are granted at runtime
4. Try clearing app cache and reinstalling

#### Module not found at runtime

```bash
# Clear node_modules
rm -rf node_modules
npm install

# iOS
cd ios && pod install && cd ..

# Android
cd android && ./gradlew clean && cd ..
```

---

## Verification Checklist

- [ ] `npm install @sourceship13/react-native-capture360` successful
- [ ] iOS: `cd ios && pod install && cd ..` passed
- [ ] iOS: `scripts/download-opencv-ios.sh` completed (or opencv2.framework present)
- [ ] Android: `android/local.properties` configured with SDK path
- [ ] Android: `./gradlew clean build` successful
- [ ] Imports work without TypeScript errors
- [ ] Example app runs and shows camera view
- [ ] Permissions added to Info.plist and AndroidManifest.xml
- [ ] Gyroscope/camera data flowing in device console

---

## Next Steps

1. **Read the [README](README.md)** for API reference
2. **Run the example app** to see Capture360 in action
3. **Check [CONTRIBUTING.md](CONTRIBUTING.md)** if you plan to contribute
4. **Open issues** on GitHub if you hit problems

**Happy capturing! 📸**
