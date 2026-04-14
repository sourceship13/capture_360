import React, { useRef, useState } from 'react';
import { View, Text, Button, StyleSheet, Platform, Alert } from 'react-native';
import { ARCameraView, PanoramaViewer, useAttitude } from '@sourceship/capture360';

export default function App() {
  const [hasPermission, setHasPermission] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<ARCameraView>(null);

  // Request permissions on mount
  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      setHasPermission(true); // iOS permission handled in Info.plist
    } else {
      // Android permission handling would go here
      setHasPermission(true);
    }
  }, []);

  const handleCapture = async () => {
    try {
      Alert.alert('Capturing frames...');
      
      if (cameraRef.current) {
        const frames = await cameraRef.current.captureFrame();
        console.log('Captured frames:', frames);
        
        // In a real app, you'd stitch these frames
        // For demo, we'll just show the count
        Alert.alert('Frames Captured', `Got ${frames.length} frames`);
      }
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture frames');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Capture360 Demo</Text>
      
      {!hasPermission ? (
        <Text style={styles.permissionText}>Waiting for permissions...</Text>
      ) : (
        <>
          <ARCameraView
            ref={cameraRef}
            style={styles.camera}
            onOrientationChange={(event) => {
              console.log('Orientation:', event.nativeEvent);
            }}
          />
          
          <Button title="Capture Frames" onPress={handleCapture} />
          
          {capturedUri && (
            <PanoramaViewer uri={capturedUri} style={styles.viewer} />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 16,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  viewer: {
    flex: 0.5,
    backgroundColor: '#333',
  },
});
