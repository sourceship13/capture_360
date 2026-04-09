/**
 * BisetkaPhotosphere - Video-based capture with ARKit tracking
 * 
 * Uses a native ARSCNView for live camera + ARKit world tracking.
 * Frames captured at ~2fps with synchronized camera pose for stitching.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';

import ARCameraView, {
  OrientationEvent,
  RecordingCompleteEvent,
} from './src/components/ARCameraView';
import SphericalGuide from './src/components/SphericalGuide';
import PanoramaViewer from './src/components/PanoramaViewer';
import {useVideoCapture} from './src/hooks/useVideoCapture';
import {composeEquirect} from './src/modules/NativePhotosphere';
import VideoRecorder from './src/modules/VideoRecorder';

function App(): React.JSX.Element {
  const [mode, setMode] = useState<'capture' | 'preview'>('capture');
  const [equirectPath, setEquirectPath] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

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
      const {yaw: rawYaw, pitch, roll} = event.nativeEvent;

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

      // Also feed coverage grid
      videoCapture.trackFrame(yaw, pitch, roll);
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
              try {
                // Build shots array with ARKit pose data for equirect compositing
                const shots = frames.map((f: any) => ({
                  path: f.path,
                  yaw: f.yaw,
                  pitch: f.pitch,
                  hFov: 43,   // portrait hFov ≈ 2*atan(tan(55°/2)*3/4) ≈ 43°
                  vFov: 55,   // portrait vFov = landscape hFov
                }));
                console.log(`[App] Composing ${shots.length} frames...`);
                const stitchedPath = await composeEquirect(shots);
                console.log(`[App] Composed: ${stitchedPath}`);
                setEquirectPath(stitchedPath);
                setMode('preview');
              } catch (err) {
                console.error('[App] Compose error:', err);
                Alert.alert('Error', String(err));
              }
            },
          },
        ],
      );
    },
    [videoCapture],
  );

  // Toggle recording
  const handleCapturePress = useCallback(() => {
    if (videoCapture.isRecording) {
      videoCapture.stopRecording();
    } else {
      videoCapture.startRecording();
    }
  }, [videoCapture]);
  
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
        <PanoramaViewer imagePath={equirectPath} />
        
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
  return (
    <SafeAreaView style={styles.container}>
      <ARCameraView
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
              ? `${videoCapture.duration.toFixed(1)}s` 
              : 'Ready'}
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
      
      {/* Capture button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.captureButton,
            videoCapture.isRecording && styles.captureButtonRecording
          ]}
          onPress={handleCapturePress}>
          <View style={[
            styles.captureButtonInner,
            videoCapture.isRecording && styles.captureButtonInnerRecording
          ]} />
        </TouchableOpacity>
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
  captureButtonRecording: {
    borderColor: '#f00',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  captureButtonInnerRecording: {
    borderRadius: 6,
    backgroundColor: '#f00',
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
});

export default App;
