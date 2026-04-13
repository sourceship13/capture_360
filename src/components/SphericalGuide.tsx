/**
 * SphericalGuide — Simple Grid Overlay
 * Fixed grid of dots representing capture positions for equirectangular panorama.
 * Grid pans as you rotate/tilt the phone to align with capture points.
 *
 * FIXES APPLIED:
 * 1. coveredIds: in video mode, derived from coverageGrid instead of empty shots[]
 * 2. findNearestDot: skips covered positions → guides user to uncaptured areas
 *
 * NOTE on projection sign: the MINUS in (center - deltaYaw * px) is CORRECT.
 * ARKit yaw = atan2(forward.x, forward.z) → positive yaw = facing LEFT.
 * Proof: capture logs show yaw DECREASING as user pans RIGHT
 *   (-149.8 → -179.9 → 150.3 → 120.7 → 90.3)
 * Therefore deltaYaw > 0 means target is to the LEFT → x < center → minus.
 */
import React, {useMemo} from 'react';
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
  row: number;
  col: number;
};

/**
 * Generate equirectangular grid for 360° panorama capture
 * Spacing: 30° horizontal, 30° vertical
 * Coverage: 12 columns × 5 rows + 2 poles = 62 shots total
 */
function generateEquirectangularGrid(): CapturePosition[] {
  const points: CapturePosition[] = [];
  let id = 0;

  const pitchLevels = [-90, -60, -30, 0, 30, 60, 90];

  pitchLevels.forEach((pitch, row) => {
    if (pitch === 90 || pitch === -90) {
      points.push({
        id: id++,
        yaw: 0,
        pitch,
        label: pitch > 0 ? 'UP' : 'DOWN',
        row,
        col: 0,
      });
    } else {
      let col = 0;
      for (let yaw = -180; yaw <= 150; yaw += 30) {
        points.push({
          id: id++,
          yaw,
          pitch,
          label: `${yaw}°/${pitch}°`,
          row,
          col,
        });
        col++;
      }
    }
  });

  return points;
}

export const SPHERE_POSITIONS = generateEquirectangularGrid();
export const NUM_SPHERE_SHOTS = SPHERE_POSITIONS.length;

// ── Projection Math ───────────────────────────────────────────────────────────

/**
 * Project a world angle (yaw/pitch) to screen coordinates.
 *
 * ARKit yaw convention (atan2(forward.x, forward.z)):
 *   Turning RIGHT → yaw DECREASES
 *   Turning LEFT  → yaw INCREASES
 *
 * So deltaYaw = targetYaw - cameraYaw:
 *   > 0 → target is to the LEFT  → screen x < center → MINUS sign
 *   < 0 → target is to the RIGHT → screen x > center → MINUS sign
 *
 * Both cases: x = center - deltaYaw * pixelsPerDeg
 */
function projectToScreen(
  targetYaw: number,
  targetPitch: number,
  cameraYaw: number,
  cameraPitch: number,
  screenW: number,
  screenH: number,
  hFov: number = 60,
  vFov: number = 75,
): {x: number; y: number; visible: boolean; distance: number} {

  let deltaYaw = targetYaw - cameraYaw;

  // Wrap yaw delta to [-180, +180]
  if (deltaYaw > 180) deltaYaw -= 360;
  if (deltaYaw < -180) deltaYaw += 360;

  const deltaPitch = targetPitch - cameraPitch;

  const margin = 15;
  const visible =
    Math.abs(deltaYaw) < hFov / 2 + margin &&
    Math.abs(deltaPitch) < vFov / 2 + margin;

  const pixelsPerDegreeH = screenW / hFov;
  const pixelsPerDegreeV = screenH / vFov;

  // MINUS: positive deltaYaw = target LEFT of camera = x < center
  const x = screenW / 2 - deltaYaw * pixelsPerDegreeH;
  const y = screenH / 2 + deltaPitch * pixelsPerDegreeV;

  const distance = Math.sqrt(deltaYaw ** 2 + deltaPitch ** 2);

  return {x, y, visible, distance};
}

/**
 * Find the nearest UNCOVERED dot to camera center.
 * After capturing the horizon ring, this guides users to tilt up/down.
 * Falls back to nearest overall if everything is covered.
 */
function findNearestDot(
  cameraYaw: number,
  cameraPitch: number,
  positions: CapturePosition[],
  coveredIds?: Set<number>,
): {position: CapturePosition; distance: number} | null {

  let nearest: CapturePosition | null = null;
  let minDistance = Infinity;

  // First pass: nearest UNCOVERED position
  for (const pos of positions) {
    if (coveredIds && coveredIds.has(pos.id)) continue;

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

  // Fallback: if everything is covered, find nearest overall
  if (!nearest) {
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
  }

  return nearest ? {position: nearest, distance: minDistance} : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  attitude: Attitude;
  shots: ShotEntry[];
  coverageGrid?: CoverageGrid[];
  debugMode?: boolean;
  videoMode?: boolean;
};

export default function SphericalGuide({
  attitude,
  shots,
  coverageGrid = [],
  debugMode = false,
  videoMode = false,
}: Props) {
  const {width: W, height: H} = useWindowDimensions();

  const hFov = 60;
  const vFov = 75;

  // ── FIX 1: derive coveredIds from coverageGrid in video mode ───────────
  // Previously shots={[]} was hardcoded, so coveredIds was always empty
  // and the guide never knew what was captured.
  const coveredIds = useMemo(() => {
    const set = new Set<number>();

    if (videoMode && coverageGrid.length > 0) {
      for (const cell of coverageGrid) {
        if (!cell.covered) continue;

        let closestId = -1;
        let closestDist = Infinity;
        for (const pos of SPHERE_POSITIONS) {
          let dYaw = pos.yaw - cell.yaw;
          if (dYaw > 180) dYaw -= 360;
          if (dYaw < -180) dYaw += 360;
          const dPitch = pos.pitch - cell.pitch;
          const dist = Math.sqrt(dYaw ** 2 + dPitch ** 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = pos.id;
          }
        }
        if (closestDist < 20) set.add(closestId);
      }
      return set;
    }

    // Photo mode: use shots array
    for (const shot of shots) {
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
      if (closestDist < 20) set.add(closestId);
    }
    return set;
  }, [shots, videoMode, coverageGrid]);

  const cameraYaw = attitude.yaw;
  const cameraPitch = attitude.pitch;

  const projectedDots = useMemo(() => {
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
          vFov,
        );

        return {
          position: {id: `grid-${idx}`, yaw: cell.yaw, pitch: cell.pitch},
          ...projection,
          captured: cell.covered,
        };
      });
    }

    return SPHERE_POSITIONS.map(pos => {
      const projection = projectToScreen(
        pos.yaw,
        pos.pitch,
        cameraYaw,
        cameraPitch,
        W,
        H,
        hFov,
        vFov,
      );

      return {
        position: pos,
        ...projection,
        captured: coveredIds.has(pos.id),
      };
    });
  }, [cameraYaw, cameraPitch, W, H, coveredIds, videoMode, coverageGrid]);

  // ── FIX 2: pass coveredIds so guidance skips already-captured positions ─
  const nearest = useMemo(() => {
    return findNearestDot(cameraYaw, cameraPitch, SPHERE_POSITIONS, coveredIds);
  }, [cameraYaw, cameraPitch, coveredIds]);

  const aligned = nearest && nearest.distance < 5;

  return (
    <View style={s.root} pointerEvents="none">

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

      {/* Center crosshair */}
      <View style={[s.crosshair, aligned && s.crosshairAligned]}>
        <View style={s.crosshairH} />
        <View style={s.crosshairV} />
      </View>

      {/* Grid dots */}
      {projectedDots.map(({position, x, y, visible, captured, distance}) => {
        if (!visible) return null;

        const isNearest = nearest?.position.id === position.id;
        const dotSize = isNearest ? 24 : (videoMode ? 20 : 16);

        const dotColor = videoMode
          ? (captured ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.7)')
          : (captured
            ? 'rgba(0, 255, 0, 0.8)'
            : isNearest
            ? 'rgba(255, 255, 0, 0.9)'
            : 'rgba(255, 255, 255, 0.6)');

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
              },
            ]}>
            <View
              style={[
                s.dotCircle,
                {
                  backgroundColor: dotColor,
                  borderColor: isNearest ? '#fff' : 'rgba(0,0,0,0.3)',
                  borderWidth: isNearest ? 3 : 2,
                },
              ]}
            />
            {captured && <Text style={s.checkMark}>✓</Text>}
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
