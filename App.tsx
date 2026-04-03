/**
 * Bisetka Photosphere — Spherical 360° capture, stitch, & interactive viewer
 * @format
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
} from 'react-native-vision-camera';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {usePhotosphere} from './src/hooks/usePhotosphere';
import type {ShotList} from './src/hooks/usePhotosphere';
import {useAttitude} from './src/hooks/useAttitude';
import SphericalGuide, {
  NUM_SPHERE_SHOTS,
} from './src/components/SphericalGuide';
import SphereViewer from './src/components/SphereViewer';

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <PhotosphereRoot />
    </SafeAreaProvider>
  );
}

function PhotosphereRoot() {
  const {state, startCapture, addShot, undoLastShot, compose, reset} =
    usePhotosphere();

  if (state.status === 'capturing') {
    return (
      <CaptureScreen
        shots={state.shots}
        onAddShot={addShot}
        onUndoLastShot={undoLastShot}
        onCompose={(h, v) => compose(state.shots, h, v)}
        onCancel={reset}
      />
    );
  }

  if (state.status === 'composing') {
    return <ComposingScreen />;
  }

  if (state.status === 'error') {
    return (
      <ErrorScreen
        message={state.message}
        onRetry={() => {
          reset();
          startCapture();
        }}
        onHome={reset}
      />
    );
  }

  if (state.status === 'done') {
    return (
      <ViewerScreen
        imagePath={state.equirectPath}
        onRetake={() => {
          reset();
          startCapture();
        }}
        onHome={reset}
      />
    );
  }

  // idle
  return <HomeScreen onStart={startCapture} />;
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({onStart}: {onStart: () => void}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, styles.darkBg]}>
      <View
        style={[
          styles.homeContent,
          {paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40},
        ]}>
        <Text style={styles.homeTitle}>BISETKA{'\n'}PHOTOSPHERE</Text>
        <Text style={styles.homeSubtitle}>
          Capture {NUM_SPHERE_SHOTS} photos covering every direction{'\n'}
          to build an interactive 360° sphere.
        </Text>

        <View style={styles.homeFeatures}>
          <Text style={styles.featureItem}>◉  Guided spherical capture grid</Text>
          <Text style={styles.featureItem}>◉  OpenCV stitching engine</Text>
          <Text style={styles.featureItem}>◉  Interactive 3D sphere viewer</Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onStart}
          activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Start Capturing</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Capture Screen ───────────────────────────────────────────────────────────

function CaptureScreen({
  shots,
  onAddShot,
  onUndoLastShot,
  onCompose,
  onCancel,
}: {
  shots: ShotList;
  onAddShot: (path: string, yaw: number, pitch: number) => void;
  onUndoLastShot: () => void;
  onCompose: (hFov: number, vFov: number) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {width: scrW, height: scrH} = useWindowDimensions();
  const cameraRef = useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const devices = useCameraDevices();
  const device = useCameraDevice('back');
  const attitude = useAttitude(true);

  const [isCapturing, setIsCapturing] = useState(false);
  const shotCount = shots.length;

  // Compute the visible camera FOV accounting for portrait mode + cover crop.
  // Filter out ultra-wide (>100°) and telephoto (<40°) formats; take median
  // to get the standard wide camera's FOV.
  const {hFov, vFov} = useMemo(() => {
    const rawFovs = (device?.formats?.map(f => f.fieldOfView).filter(Boolean) ?? [])
      .filter(f => f >= 40 && f <= 100);
    const sorted = rawFovs.sort((a, b) => a - b);
    const sensorHFov = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : 69;
    const DEG = Math.PI / 180;
    const visH =
      (2 * Math.atan(Math.tan((sensorHFov / 2) * DEG) * (scrW / scrH))) / DEG;
    return {hFov: visH, vFov: sensorHFov};
  }, [device?.formats, scrW, scrH]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Capture is always allowed — stores actual device orientation
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      // On first shot, reset yaw offset to lock grid at current position
      if (shots.length === 0) {
        console.log('[CaptureScreen] First shot - locking grid at current yaw');
        attitude.resetYawOffset();
      }
      
      const result = await cameraRef.current.takePhoto({flash: 'off'});
      const rawPath = result.path.startsWith('file://')
        ? result.path.slice(7)
        : result.path;
      // Use adjusted yaw (relative to start) to match grid which is also relative
      onAddShot(rawPath, attitude.yaw, attitude.pitch);
    } catch (e: any) {
      Alert.alert('Capture Error', e.message);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, attitude, shots.length, onAddShot]);

  if (!hasPermission) {
    return (
      <View style={[styles.fill, styles.darkBg, styles.centered]}>
        <Text style={styles.bodyText}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.fill, styles.darkBg, styles.centered]}>
        {devices.length === 0 ? (
          <>
            <Text style={styles.noCameraEmoji}>📷</Text>
            <Text style={styles.bodyText}>No camera available</Text>
            <Text style={styles.hintText}>
              Use a physical device — cameras are not supported on the iOS
              Simulator.
            </Text>
          </>
        ) : (
          <ActivityIndicator size="large" color="#fff" />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        outputOrientation="device"
      />

      {/* Grid overlay */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {Array.from({length: 11}).map((_, i) => (
          <View
            key={`h${i}`}
            style={[
              styles.gridLineH,
              {top: `${(i / 10) * 100}%`},
            ]}
          />
        ))}
        {Array.from({length: 11}).map((_, i) => (
          <View
            key={`v${i}`}
            style={[
              styles.gridLineV,
              {left: `${(i / 10) * 100}%`},
            ]}
          />
        ))}
      </View>

      {/* Centre crosshair — thin lines only, no center dot */}
      <View style={styles.crosshairContainer} pointerEvents="none">
        <View style={[styles.crosshairH, {backgroundColor: 'rgba(255,255,255,0.5)'}]} />
        <View style={[styles.crosshairV, {backgroundColor: 'rgba(255,255,255,0.5)'}]} />
      </View>

      {/* Spherical guide overlay */}
      <SphericalGuide
        shots={shots}
        attitude={attitude}
        hFov={hFov}
        vFov={vFov}
      />

      {/* Image counter */}
      <View style={[styles.imageCounterContainer, {top: insets.top + 12}]}>
        <View style={styles.imageCounter}>
          <Text style={styles.imageCounterText}>
            {shotCount} Images
          </Text>
        </View>
        <View style={styles.helperTextContainer}>
          <Text style={styles.helperText}>
            Point anywhere and tap capture
          </Text>
        </View>
      </View>

      {/* Top bar — just the close button */}
      <View style={[styles.captureTopBar, {paddingTop: insets.top + 8}]}>
        <TouchableOpacity style={styles.iconBtn} onPress={onCancel}>
          <Text style={styles.iconBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.iconBtn} />
      </View>

      {/* Bottom controls */}
      <View
        style={[styles.captureBottomBar, {paddingBottom: insets.bottom + 16}]}>
        {/* Red capture button */}
        <TouchableOpacity
          style={[
            styles.captureButtonOuter,
            isCapturing && styles.disabled,
          ]}
          onPress={handleCapture}
          activeOpacity={0.7}
          disabled={isCapturing}>
          <View
            style={[
              styles.captureButtonInner,
              isCapturing && styles.captureButtonActive,
            ]}
          />
        </TouchableOpacity>

        <View style={styles.bottomButtonsRow}>
          {shotCount >= 1 && (
            <TouchableOpacity
              style={styles.undoBtn}
              onPress={onUndoLastShot}
              activeOpacity={0.8}>
              <Text style={styles.undoBtnText}>Undo Last</Text>
            </TouchableOpacity>
          )}
          {shotCount >= 1 && (
            <TouchableOpacity
              style={styles.viewSphereBtn}
              onPress={() => onCompose(hFov, vFov)}
              activeOpacity={0.8}>
              <Text style={styles.viewSphereBtnText}>
                View Sphere ({shotCount})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Composing Screen ─────────────────────────────────────────────────────────

function ComposingScreen() {
  return (
    <View style={[styles.fill, styles.darkBg, styles.centered]}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={styles.stitchTitle}>Building Panorama…</Text>
      <Text style={[styles.hintText, {marginTop: 12}]}>
        Composing your photos into an equirectangular image
      </Text>
    </View>
  );
}

// ─── Viewer Screen (360° Sphere) ──────────────────────────────────────────────

function ViewerScreen({
  imagePath,
  onRetake,
  onHome,
}: {
  imagePath: string;
  onRetake: () => void;
  onHome: () => void;
}) {
  const insets = useSafeAreaInsets();
  const attitude = useAttitude(true);
  return (
    <View style={styles.fill}>
      <SphereViewer imagePath={imagePath} attitude={attitude} />

      {/* Top bar overlay */}
      <View style={[styles.viewerTopBar, {paddingTop: insets.top + 8}]}>
        <Text style={styles.viewerTitle}>360° Photosphere</Text>
        <Text style={styles.viewerHint}>Drag to look around · Pinch to zoom</Text>
      </View>

      {/* Bottom controls overlay */}
      <View
        style={[styles.viewerBottomBar, {paddingBottom: insets.bottom + 16}]}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={onHome}
          activeOpacity={0.8}>
          <Text style={styles.outlineBtnText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onRetake}
          activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Retake</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
  onHome,
}: {
  message: string;
  onRetry: () => void;
  onHome: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.fill,
        styles.darkBg,
        styles.centered,
        {paddingHorizontal: 32, paddingTop: insets.top, paddingBottom: insets.bottom},
      ]}>
      <Text style={styles.errorTitle}>Composing Failed</Text>
      <Text style={[styles.hintText, {marginBottom: 32, textAlign: 'center'}]}>
        {message}
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, {marginBottom: 16}]}
        onPress={onRetry}
        activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.outlineBtn} onPress={onHome} activeOpacity={0.8}>
        <Text style={styles.outlineBtnText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INDIGO = '#4f46e5';
const INDIGO_LIGHT = '#6366f1';

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  darkBg: {
    backgroundColor: '#080810',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Home ───────────────────────────────────────────────────────────────────
  homeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  homeTitle: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 4,
    lineHeight: 42,
    marginBottom: 18,
  },
  homeSubtitle: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 28,
  },
  homeFeatures: {
    alignSelf: 'stretch',
    gap: 10,
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  featureItem: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Shared buttons ─────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: INDIGO,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 50,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  outlineBtn: {
    paddingHorizontal: 36,
    paddingVertical: 15,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  outlineBtnText: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Grid overlay ───────────────────────────────────────────────────────────
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // ── Centre crosshair ──────────────────────────────────────────────────────
  crosshairContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  crosshairH: {
    position: 'absolute',
    width: 40,
    height: 1.5,
  },
  crosshairV: {
    position: 'absolute',
    width: 1.5,
    height: 40,
  },
  crosshairDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // ── Image counter + helper text ────────────────────────────────────────────
  imageCounterContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  imageCounter: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  helperTextContainer: {
    marginTop: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    maxWidth: '80%',
  },
  helperText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },

  // ── Capture top bar ────────────────────────────────────────────────────────
  captureTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.3,
  },

  // ── Capture bottom bar ─────────────────────────────────────────────────────
  captureBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
    gap: 20,
    zIndex: 10,
  },
  captureButtonOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f71735',
  },
  captureButtonActive: {
    backgroundColor: '#a0102b',
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  viewSphereBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    minWidth: 80,
    alignItems: 'center',
  },
  viewSphereBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetBtn: {
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    minWidth: 80,
    alignItems: 'center',
  },
  resetBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  undoBtn: {
    backgroundColor: 'rgba(255, 165, 0, 0.4)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    minWidth: 80,
    alignItems: 'center' as const,
  },
  undoBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },

  // ── Stitching ──────────────────────────────────────────────────────────────
  stitchTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 20,
    textAlign: 'center',
  },

  // ── Viewer (Sphere) ────────────────────────────────────────────────────────
  viewerTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },
  viewerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  viewerHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  viewerBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorTitle: {
    color: '#f87171',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },

  // ── Shared text ────────────────────────────────────────────────────────────
  bodyText: {
    color: '#fff',
    fontSize: 17,
    marginBottom: 20,
    textAlign: 'center',
  },
  hintText: {
    color: '#666',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  noCameraEmoji: {
    fontSize: 56,
    marginBottom: 14,
  },
});
