/**
 * BisetkaPhotosphere - Manual tap-to-capture with ARKit tracking
 * 
 * Uses a native ARSCNView for live camera + ARKit world tracking.
 * User taps to capture each frame when phone is stationary — no motion blur.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Modal,
  ActivityIndicator,
  NativeEventEmitter,
  NativeModules,
} from 'react-native';

import ARCameraView, {
  OrientationEvent,
  RecordingCompleteEvent,
  ARCameraViewHandle,
} from './src/components/ARCameraView';
import SphericalGuide from './src/components/SphericalGuide';
import SphereViewer from './src/components/SphereViewer';
import {useVideoCapture} from './src/hooks/useVideoCapture';
import {composeEquirect} from './src/modules/NativePhotosphere';
import VideoRecorder from './src/modules/VideoRecorder';

function App(): React.JSX.Element {
  const [mode, setMode] = useState<'capture' | 'preview'>('capture');
  const [equirectPath, setEquirectPath] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressPhase, setProgressPhase] = useState('');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const prevCapturedCountRef = useRef(0);

  const cameraRef = useRef<ARCameraViewHandle>(null);
  const videoCapture = useVideoCapture();

  // Latest ARKit orientation — used by SphericalGuide
  const yawOffsetRef = useRef<number | null>(null);
  const [arAttitude, setArAttitude] = useState({
    yaw: 0,
    pitch: 0,
    roll: 0,
    rawYaw: 0,
    resetYawOffset: () => {
      yawOffsetRef.current = null;
    },
  });

  // Listen for native progress events
  useEffect(() => {
    const emitter = new NativeEventEmitter(NativeModules.NativePhotosphere);
    const sub = emitter.addListener('stitchProgress', (event: any) => {
      setProgressPhase(event.phase);
      setProgressCurrent(event.current);
      setProgressTotal(event.total);
    });
    return () => sub.remove();
  }, []);

  // Request camera permission via our native module
  useEffect(() => {
    (async () => {
      const status = await VideoRecorder.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // ARKit orientation events → update attitude + coverage grid
  const handleOrientationUpdate = useCallback(
    (event: OrientationEvent) => {
      const {yaw: rawYaw, pitch, roll, capturedCount: count} = event.nativeEvent;

      // Track captured count from native side
      if (count != null) {
        setCapturedCount(count);
      }

      // Auto-calibrate: first orientation becomes 0°
      if (yawOffsetRef.current === null) {
        yawOffsetRef.current = rawYaw;
      }
      let yaw = rawYaw - (yawOffsetRef.current ?? 0);
      // Normalise to -180..180
      if (yaw > 180) yaw -= 360;
      if (yaw < -180) yaw += 360;

      setArAttitude(prev => ({
        ...prev,
        yaw,
        pitch,
        roll,
        rawYaw,
      }));

      // Only mark coverage when a new frame was actually captured
      if (count != null && count > prevCapturedCountRef.current) {
        prevCapturedCountRef.current = count;
        videoCapture.trackFrame(yaw, pitch, roll);
      }
    },
    [videoCapture],
  );

  // Native tells us recording is done + gives us the captured frames
  const handleRecordingComplete = useCallback(
    (event: RecordingCompleteEvent) => {
      const {frameCount, frames, sessionDir} = event.nativeEvent;

      console.log(`[App] Recording complete: ${frameCount} frames in ${sessionDir}`);

      Alert.alert(
        'Recording Complete',
        `Frames: ${frameCount}\nCoverage: ${videoCapture.coveragePercent}%`,
        [
          {text: 'Retake', onPress: () => videoCapture.reset()},
          {
            text: 'Process',
            onPress: async () => {
              if (frameCount === 0) {
                Alert.alert('Error', 'No frames captured');
                return;
              }
              setProcessing(true);
              setProgressPhase('loading');
              setProgressCurrent(0);
              setProgressTotal(frameCount);
              try {
                const shots = frames.map((f: any) => ({
                  path: f.path,
                  yaw: f.yaw,
                  pitch: f.pitch,
                  hFov: f.hFov || 65,
                  vFov: f.vFov || 50,
                  rotationMatrix: f.rotationMatrix || null,
                  fx: f.fx,
                  fy: f.fy,
                  cx: f.cx,
                  cy: f.cy,
                  imageWidth: f.imageWidth,
                  imageHeight: f.imageHeight,
                }));
                console.log(`[App] Composing ${shots.length} frames...`);
                const stitchedPath = await composeEquirect(shots);
                console.log(`[App] Composed: ${stitchedPath}`);
                setEquirectPath(stitchedPath);
                setMode('preview');
              } catch (err) {
                console.error('[App] Compose error:', err);
                Alert.alert('Error', String(err));
              } finally {
                setProcessing(false);
              }
            },
          },
        ],
      );
    },
    [videoCapture],
  );

  // Toggle recording session (start/stop)
  const handleSessionToggle = useCallback(() => {
    if (videoCapture.isRecording) {
      videoCapture.stopRecording();
    } else {
      setCapturedCount(0);
      prevCapturedCountRef.current = 0;
      videoCapture.startRecording();
    }
  }, [videoCapture]);

  // Manual tap-to-capture a single frame
  const handleCaptureFrame = useCallback(() => {
    if (!videoCapture.isRecording) return;
    cameraRef.current?.captureFrame();
  }, [videoCapture.isRecording]);
  
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.permissionText}>Camera permission required</Text>
      </SafeAreaView>
    );
  }
  
  // Preview mode - show stitched equirectangular
  if (mode === 'preview' && equirectPath) {
    return (
      <SafeAreaView style={styles.container}>
        <SphereViewer imagePath={equirectPath} />
        
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => {
              setMode('capture');
              setEquirectPath(null);
              videoCapture.reset();
            }}>
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => {
              console.log('[App] Save to library - TODO');
            }}>
            <Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  // Capture mode - show camera + grid overlay
  const progressPercent = progressTotal > 0
    ? Math.round((progressCurrent / progressTotal) * 100)
    : 0;
  const phaseLabel = progressPhase === 'loading'
    ? 'Loading frames'
    : progressPhase === 'saving'
    ? 'Saving panorama'
    : 'Stitching';

  return (
    <SafeAreaView style={styles.container}>
      {/* Processing modal */}
      <Modal
        visible={processing}
        transparent
        animationType="fade"
        statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.modalTitle}>{phaseLabel}</Text>
            <Text style={styles.modalStatus}>
              {progressCurrent}/{progressTotal} frames
            </Text>
            <View style={styles.progressBarModal}>
              <View
                style={[
                  styles.progressBarFill,
                  {width: `${progressPercent}%`},
                ]}
              />
            </View>
            <Text style={styles.modalPercent}>{progressPercent}%</Text>
          </View>
        </View>
      </Modal>

      <ARCameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        isRecording={videoCapture.isRecording}
        onOrientationUpdate={handleOrientationUpdate}
        onRecordingComplete={handleRecordingComplete}
      />
      
      {/* Grid overlay showing coverage */}
      <SphericalGuide
        attitude={arAttitude}
        shots={[]}
        coverageGrid={videoCapture.coverageGrid}
        videoMode={true}
      />
      
      {/* Recording status HUD */}
      <View style={styles.topHUD}>
        <View style={[
          styles.recordingIndicator,
          videoCapture.isRecording && styles.recordingActive
        ]}>
          {videoCapture.isRecording && <Text style={styles.recordingDot}>●</Text>}
          <Text style={styles.hudText}>
            {videoCapture.isRecording 
              ? `${capturedCount} frames captured` 
              : 'Ready — tap Start'}
          </Text>
        </View>
        
        <View style={styles.coverageIndicator}>
          <Text style={styles.hudText}>
            Coverage: {videoCapture.coveragePercent}%
          </Text>
          <View style={styles.coverageBar}>
            <View 
              style={[
                styles.coverageBarFill,
                {width: `${videoCapture.coveragePercent}%`}
              ]} 
            />
          </View>
        </View>
      </View>
      
      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {!videoCapture.isRecording ? (
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleSessionToggle}>
            <Text style={styles.startButtonText}>Start Session</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={handleSessionToggle}>
              <Text style={styles.buttonText}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureButton}
              onPress={handleCaptureFrame}
              activeOpacity={0.6}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>

            <View style={styles.frameCountBadge}>
              <Text style={styles.frameCountText}>{capturedCount}</Text>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  topHUD: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    gap: 12,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  recordingActive: {
    backgroundColor: 'rgba(220,0,0,0.8)',
  },
  recordingDot: {
    color: '#fff',
    fontSize: 20,
    marginRight: 6,
  },
  hudText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  coverageIndicator: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  coverageBar: {
    marginTop: 6,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  coverageBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  doneButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    position: 'absolute',
    left: 30,
  },
  frameCountBadge: {
    position: 'absolute',
    right: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  frameCountText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 36,
    alignItems: 'center',
    width: 260,
    gap: 10,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  modalStatus: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  progressBarModal: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  modalPercent: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default App;
