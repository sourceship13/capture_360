/**
 * Video-based photosphere capture hook.
 * Manages recording state & spherical coverage grid.
 * Frame capture + pose tracking is handled natively by ARCameraView.
 */

import {useCallback, useRef, useState} from 'react';

export interface VideoFrame {
  timestamp: number;  // seconds since recording start
  yaw: number;        // degrees
  pitch: number;      // degrees
  roll: number;       // degrees
}

export interface CoverageGrid {
  yaw: number;
  pitch: number;
  covered: boolean;
}

interface RecordingState {
  isRecording: boolean;
  duration: number;  // seconds
  frames: VideoFrame[];
  coverageGrid: CoverageGrid[];
}

const GRID_RESOLUTION = 30; // degrees between grid points
const MIN_COVERAGE_THRESHOLD = 15; // degrees - mark grid cell as covered if camera points within this distance

// Generate spherical grid for coverage tracking
function generateCoverageGrid(): CoverageGrid[] {
  const grid: CoverageGrid[] = [];
  
  // Pitch levels from -90° to +90° every 30°
  for (let pitch = -90; pitch <= 90; pitch += GRID_RESOLUTION) {
    // Yaw positions - fewer at poles, more at equator
    const numYawPositions = pitch === 90 || pitch === -90 ? 1 : Math.ceil(360 / GRID_RESOLUTION);
    
    for (let i = 0; i < numYawPositions; i++) {
      const yaw = (i * 360 / numYawPositions) - 180;
      grid.push({yaw, pitch, covered: false});
    }
  }
  
  return grid;
}

// Calculate angular distance between two orientations
function angularDistance(yaw1: number, pitch1: number, yaw2: number, pitch2: number): number {
  const dYaw = Math.abs(yaw1 - yaw2);
  const dPitch = Math.abs(pitch1 - pitch2);
  return Math.sqrt(dYaw * dYaw + dPitch * dPitch);
}

export function useVideoCapture() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    frames: [],
    coverageGrid: generateCoverageGrid(),
  });
  
  const startTimeRef = useRef<number>(0);
  const frameIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Mark recording as started (camera ref recording is triggered by the component)
  const startRecording = useCallback(() => {
    startTimeRef.current = Date.now();
    
    setState({
      isRecording: true,
      duration: 0,
      frames: [],
      coverageGrid: generateCoverageGrid(),
    });
    
    // Duration ticker
    frameIntervalRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        duration: (Date.now() - startTimeRef.current) / 1000,
      }));
    }, 100);
  }, []);
  
  // Track camera orientation (called from useAttitude updates)
  const trackFrame = useCallback((yaw: number, pitch: number, roll: number) => {
    setState(prev => {
      if (!prev.isRecording) return prev;
      
      const timestamp = (Date.now() - startTimeRef.current) / 1000;
      const frame: VideoFrame = {timestamp, yaw, pitch, roll};
      
      // Update coverage grid
      const updatedGrid = prev.coverageGrid.map(cell => {
        if (cell.covered) return cell;
        
        const dist = angularDistance(yaw, pitch, cell.yaw, cell.pitch);
        if (dist < MIN_COVERAGE_THRESHOLD) {
          return {...cell, covered: true};
        }
        return cell;
      });
      
      return {
        ...prev,
        duration: timestamp,
        frames: [...prev.frames, frame],
        coverageGrid: updatedGrid,
      };
    });
  }, []);
  
  // Stop recording (frame data comes from ARCameraView's onRecordingComplete)
  const stopRecording = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    setState(prev => ({...prev, isRecording: false}));
  }, []);
  
  // Reset state
  const reset = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    
    setState({
      isRecording: false,
      duration: 0,
      frames: [],
      coverageGrid: generateCoverageGrid(),
    });
    
    startTimeRef.current = 0;
  }, []);
  
  // Calculate coverage percentage
  const coveragePercent = Math.round(
    (state.coverageGrid.filter(c => c.covered).length / state.coverageGrid.length) * 100
  );
  
  return {
    isRecording: state.isRecording,
    duration: state.duration,
    frames: state.frames,
    coverageGrid: state.coverageGrid,
    coveragePercent,
    startRecording,
    trackFrame,
    stopRecording,
    reset,
  };
}
