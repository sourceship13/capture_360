/**
 * SphericalGuide — Simple Grid Overlay
 * Fixed grid of dots representing capture positions for equirectangular panorama.
 * Grid pans as you rotate/tilt the phone to align with capture points.
 */
import React, {useMemo, useState, useEffect} from 'react';
import {View, Text, StyleSheet, useWindowDimensions} from 'react-native';
import type {Attitude} from '../hooks/useAttitude';
import type {ShotEntry} from '../hooks/usePhotosphere';
import type {CoverageGrid} from '../hooks/useVideoCapture';

// ── Grid Configuration ────────────────────────────────────────────────────────

export type CapturePosition = {
  id: number;
  yaw: number;      // horizontal angle in degrees (-180 to +180)
  pitch: number;    // vertical angle in degrees (-90 to +90)
  label: string;
};

/**
 * Generate equirectangular grid for 360° panorama capture
 * Spacing: 30° horizontal, 30° vertical (gives ~45% overlap with 55°×70° FOV)
 * Coverage: 12 columns × 6 rows = ~74 shots total
 */
function generateEquirectangularGrid(): CapturePosition[] {
  const points: CapturePosition[] = [];
  let id = 0;
  
  // Vertical levels: -90° (down), -60°, -30°, 0° (horizon), +30°, +60°, +90° (up)
  // 30° spacing gives good overlap with 70° VFOV
  const pitchLevels = [-90, -60, -30, 0, 30, 60, 90];
  
  for (const pitch of pitchLevels) {
    if (pitch === 90 || pitch === -90) {
      // Poles: single shot straight up/down
      points.push({
        id: id++,
        yaw: 0,
        pitch,
        label: pitch > 0 ? 'UP' : 'DOWN'
      });
    } else {
      // Horizontal ring: 12 shots at 30° spacing for ~45% overlap
      // Start at -180° (behind), go to +150° (covers full 360°)
      for (let yaw = -180; yaw <= 150; yaw += 30) {
        points.push({
          id: id++,
          yaw,
          pitch,
          label: `${yaw}°/${pitch}°`
        });
      }
    }
  }
  
  return points;
}

export const SPHERE_POSITIONS = generateEquirectangularGrid();
export const NUM_SPHERE_SHOTS = SPHERE_POSITIONS.length;

// ── Projection Math ───────────────────────────────────────────────────────────

/**
 * Project a world angle (yaw/pitch) to screen coordinates based on current camera orientation
 * Returns screen x,y and visibility
 */
function projectToScreen(
  targetYaw: number,      // where the dot is in world space
  targetPitch: number,    // where the dot is in world space
  cameraYaw: number,      // current camera orientation
  cameraPitch: number,    // current camera orientation
  screenW: number,
  screenH: number,
  hFov: number = 60,      // horizontal field of view in degrees
  vFov: number = 75,      // vertical field of view in degrees
): {x: number; y: number; visible: boolean; distance: number} {
  
  // Calculate angular distance from camera center to target
  let deltaYaw = targetYaw - cameraYaw;
  
  // Wrap yaw delta to [-180, +180]
  if (deltaYaw > 180) deltaYaw -= 360;
  if (deltaYaw < -180) deltaYaw += 360;
  
  const deltaPitch = targetPitch - cameraPitch;
  
  // Check if target is within field of view (with small margin)
  const margin = 15; // degrees
  const visible = 
    Math.abs(deltaYaw) < hFov / 2 + margin &&
    Math.abs(deltaPitch) < vFov / 2 + margin;
  
  // Project angular offsets to screen pixels
  // Center of screen = camera center
  // Positive deltaYaw = target is to the right → positive x
  // Positive deltaPitch = target is above → positive y (look up → pan up)
  
  const pixelsPerDegreeH = screenW / hFov;
  const pixelsPerDegreeV = screenH / vFov;
  
  const x = screenW / 2 + deltaYaw * pixelsPerDegreeH;
  const y = screenH / 2 + deltaPitch * pixelsPerDegreeV;
  
  // Calculate angular distance for alignment helper
  const distance = Math.sqrt(deltaYaw ** 2 + deltaPitch ** 2);
  
  return {x, y, visible, distance};
}

/**
 * Find the nearest dot to camera center for alignment helper
 */
function findNearestDot(
  cameraYaw: number,
  cameraPitch: number,
  positions: CapturePosition[]
): {position: CapturePosition; distance: number} | null {
  
  let nearest: CapturePosition | null = null;
  let minDistance = Infinity;
  
  for (const pos of positions) {
    let deltaYaw = pos.yaw - cameraYaw;
    if (deltaYaw > 180) deltaYaw -= 360;
    if (deltaYaw < -180) deltaYaw += 360;
    
    const deltaPitch = pos.pitch - cameraPitch;
    const distance = Math.sqrt(deltaYaw ** 2 + deltaPitch ** 2);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearest = pos;
    }
  }
  
  return nearest ? {position: nearest, distance: minDistance} : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  attitude: Attitude;
  shots: ShotEntry[];
  coverageGrid?: CoverageGrid[];  // for video mode coverage visualization
  debugMode?: boolean;
  videoMode?: boolean;  // show coverage grid instead of discrete dots
};

export default function SphericalGuide({
  attitude,
  shots,
  coverageGrid = [],
  debugMode = false,
  videoMode = false,
}: Props) {
  const {width: W, height: H} = useWindowDimensions();
  
  // Reference yaw is now managed by useAttitude hook via resetYawOffset()
  // No need to track it locally — attitude.yaw is already relative to locked reference
  
  const hFov = 60; // horizontal FOV in degrees (typical smartphone)
  const vFov = 75; // vertical FOV in degrees
  
  // Track which positions have been captured
  const coveredIds = useMemo(() => {
    const set = new Set<number>();
    
    console.log(`[coveredIds] Checking ${shots.length} shots against ${SPHERE_POSITIONS.length} positions`);
    
    for (const shot of shots) {
      // Find closest grid position to this shot
      let closestId = -1;
      let closestDist = Infinity;
      
      for (const pos of SPHERE_POSITIONS) {
        let dYaw = pos.yaw - shot.yaw;
        if (dYaw > 180) dYaw -= 360;
        if (dYaw < -180) dYaw += 360;
        const dPitch = pos.pitch - shot.pitch;
        const dist = Math.sqrt(dYaw ** 2 + dPitch ** 2);
        
        if (dist < closestDist) {
          closestDist = dist;
          closestId = pos.id;
        }
      }
      
      console.log(`[coveredIds] Shot at yaw=${shot.yaw.toFixed(1)}° pitch=${shot.pitch.toFixed(1)}° → closest pos ${closestId} (${closestDist.toFixed(1)}° away)`);
      
      // Mark as covered if shot is within 20° of grid position
      if (closestDist < 20) {
        set.add(closestId);
        console.log(`[coveredIds] ✓ Marked position ${closestId} as covered`);
      } else {
        console.log(`[coveredIds] ✗ Too far (${closestDist.toFixed(1)}° > 20°)`);
      }
    }
    
    console.log(`[coveredIds] Final covered set:`, Array.from(set));
    return set;
  }, [shots]);
  
  // Use offset-adjusted yaw from attitude hook
  const cameraYaw = attitude.yaw;
  const cameraPitch = attitude.pitch;
  
  // Project all grid positions to screen
  const projectedDots = useMemo(() => {
    // In video mode, show coverage grid instead of discrete dots
    if (videoMode && coverageGrid.length > 0) {
      return coverageGrid.map((cell, idx) => {
        const projection = projectToScreen(
          cell.yaw,
          cell.pitch,
          cameraYaw,
          cameraPitch,
          W,
          H,
          hFov,
          vFov
        );
        
        return {
          position: {id: `grid-${idx}`, yaw: cell.yaw, pitch: cell.pitch},
          ...projection,
          captured: cell.covered,  // gray out if covered
        };
      });
    }
    
    // Photo mode - show discrete dots
    return SPHERE_POSITIONS.map(pos => {
      const projection = projectToScreen(
        pos.yaw,
        pos.pitch,
        cameraYaw,
        cameraPitch,
        W,
        H,
        hFov,
        vFov
      );
      
      return {
        position: pos,
        ...projection,
        captured: coveredIds.has(pos.id),
      };
    });
  }, [cameraYaw, cameraPitch, W, H, coveredIds, videoMode, coverageGrid]);
  
  // Find nearest dot for alignment helper
  const nearest = useMemo(() => {
    return findNearestDot(cameraYaw, cameraPitch, SPHERE_POSITIONS);
  }, [cameraYaw, cameraPitch]);
  
  // Alignment state: aligned if nearest dot is within 5°
  const aligned = nearest && nearest.distance < 5;
  
  return (
    <View style={s.root} pointerEvents="none">
      
      {/* Debug info */}
      {debugMode && (
        <View style={s.debugBox}>
          <Text style={s.debugText}>
            Camera: yaw={cameraYaw.toFixed(1)}° pitch={cameraPitch.toFixed(1)}°{'\n'}
            Raw: yaw={attitude.rawYaw.toFixed(1)}°{'\n'}
            Nearest: {nearest ? `${nearest.position.label} (${nearest.distance.toFixed(1)}° away)` : 'none'}{'\n'}
            Aligned: {aligned ? '✓ YES' : '✗ NO'}{'\n'}
            Shots: {shots.length} | Covered: {coveredIds.size}/{NUM_SPHERE_SHOTS}
          </Text>
        </View>
      )}
      
      {/* Center crosshair (camera center) */}
      <View style={[s.crosshair, aligned && s.crosshairAligned]}>
        <View style={s.crosshairH} />
        <View style={s.crosshairV} />
      </View>
      
      {/* Grid dots */}
      {projectedDots.map(({position, x, y, visible, captured, distance}) => {
        if (!visible) return null;
        
        const isNearest = nearest?.position.id === position.id;
        const dotSize = isNearest ? 24 : (videoMode ? 20 : 16);  // bigger in video mode
        
        // In video mode: gray = covered, white = uncovered
        // In photo mode: green = captured, yellow = target, white = uncaptured
        const dotColor = videoMode
          ? (captured ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.7)')  // video mode
          : (captured 
            ? 'rgba(0, 255, 0, 0.8)'  // photo mode captured
            : isNearest
            ? 'rgba(255, 255, 0, 0.9)' // photo mode target
            : 'rgba(255, 255, 255, 0.6)'); // photo mode uncaptured
        
        return (
          <View
            key={position.id}
            style={[
              s.dot,
              {
                left: x - dotSize / 2,
                top: y - dotSize / 2,
                width: dotSize,
                height: dotSize,
              }
            ]}
          >
            <View
              style={[
                s.dotCircle,
                {
                  backgroundColor: dotColor,
                  borderColor: isNearest ? '#fff' : 'rgba(0,0,0,0.3)',
                  borderWidth: isNearest ? 3 : 2,
                }
              ]}
            />
            {captured && (
              <Text style={s.checkMark}>✓</Text>
            )}
          </View>
        );
      })}
      
      {/* Alignment hint */}
      {nearest && !aligned && (
        <View style={s.hintBox}>
          <Text style={s.hintText}>
            Align to {nearest.position.label}
          </Text>
          <Text style={s.hintDist}>
            {nearest.distance.toFixed(1)}° away
          </Text>
        </View>
      )}
      
      {aligned && (
        <View style={[s.hintBox, s.hintAligned]}>
          <Text style={[s.hintText, {color: '#0f0'}]}>
            ✓ ALIGNED — Tap to capture
          </Text>
        </View>
      )}
      
      {/* Progress bar */}
      <View style={s.progressBar}>
        <Text style={s.progressText}>
          {coveredIds.size >= NUM_SPHERE_SHOTS
            ? '✓ Full coverage!'
            : `${coveredIds.size}/${NUM_SPHERE_SHOTS} positions`}
        </Text>
      </View>
      
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  
  debugBox: {
    position: 'absolute',
    top: 100,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 8,
    borderRadius: 6,
    zIndex: 999,
  },
  debugText: {
    color: '#0f0',
    fontSize: 11,
    fontFamily: 'Menlo',
    lineHeight: 14,
  },
  
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairAligned: {
    // Scale up when aligned
    transform: [{scale: 1.2}],
  },
  crosshairH: {
    position: 'absolute',
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  
  dot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  checkMark: {
    position: 'absolute',
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  
  hintBox: {
    position: 'absolute',
    top: 160,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintAligned: {
    backgroundColor: 'rgba(0,255,0,0.15)',
    paddingVertical: 8,
  },
  hintText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  hintDist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  
  progressBar: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  progressText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
});
