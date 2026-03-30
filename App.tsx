/**
 * Bisetka Photosphere — Full-screen Camera with Capture
 * @format
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  PhotoFile,
} from 'react-native-vision-camera';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useDeviceOrientation} from './src/hooks/useDeviceOrientation';


function App() {
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <CameraScreen />
    </SafeAreaProvider>
  );
}

function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const devices = useCameraDevices();
  const device = useCameraDevice('back');

  const [photo, setPhoto] = useState<PhotoFile | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Orientation hook — tracks device orientation from VisionCamera's sensor
  // pipeline and lets us freeze it at the exact moment the shutter fires.
  const {onOrientationChange, snapshotOrientation, capturedOrientation, resetOrientation} =
    useDeviceOrientation();

  // Request permission on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) {
      return;
    }
    setCapturing(true);
    try {
      // Snapshot orientation BEFORE the async photo call so it matches
      // the physical position of the phone at the moment of capture.
      snapshotOrientation();
      const result = await cameraRef.current.takePhoto({flash: 'off'});
      setPhoto(result);
    } catch (e: any) {
      Alert.alert('Capture Error', e.message);
    } finally {
      setCapturing(false);
    }
  }, [capturing, snapshotOrientation]);

  const handleRetake = useCallback(() => {
    setPhoto(null);
    resetOrientation();
  }, [resetOrientation]);

  // ─── Permission not yet granted ───
  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── No camera device available (e.g. Simulator) ───
  if (!device) {
    const noDevicesAtAll = devices.length === 0;
    return (
      <View style={styles.centered}>
        {noDevicesAtAll ? (
          <>
            <Text style={styles.noCameraEmoji}>📷</Text>
            <Text style={styles.permissionText}>No camera available</Text>
            <Text style={styles.hintText}>
              This device has no cameras. If you're running on the iOS Simulator,
              cameras are not supported — please use a physical device.
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.permissionText}>Loading camera…</Text>
          </>
        )}
      </View>
    );
  }

  // ─── Photo preview ───
  if (photo) {
    return (
      <View style={styles.fill}>
        <Image
          source={{uri: `file://${photo.path}`}}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        {/* Top bar */}
        <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
          <Text style={styles.previewTitle}>Captured Photo</Text>
        </View>
        {/* Bottom bar */}
        <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 16}]}>
          <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
            <Text style={styles.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Live camera view ───
  return (
    <View style={styles.fill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        outputOrientation="preview"
        onPreviewOrientationChanged={onOrientationChange}
      />
      {/* Capture button at bottom */}
      <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 16}]}>
        <TouchableOpacity
          style={styles.captureOuter}
          onPress={handleCapture}
          activeOpacity={0.7}
          disabled={capturing}>
          <View
            style={[
              styles.captureInner,
              capturing && styles.captureInnerActive,
            ]}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
  },
  noCameraEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  hintText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  captureOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  captureInnerActive: {
    backgroundColor: '#ccc',
  },
  retakeBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retakeBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default App;
