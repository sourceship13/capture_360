/**
 * SphericalGuide — TRUE AR MODE
 * Dots are fixed in world space and only visible when camera points at them.
 * Uses rotation matrix to transform world→camera for proper AR projection.
 */
import React, {useMemo} from 'react';
import {View, Text, StyleSheet, useWindowDimensions} from 'react-native';
import type {Attitude} from '../hooks/useAttitude';
import type {ShotEntry} from '../hooks/usePhotosphere';

// ── Grid: 30° spacing ─────────────────────────────────────────────────────────

export type CapturePosition = {
  id: number;
  yaw: number;
  pitch: number;
  label: string;
};

function generateRegularGrid(): CapturePosition[] {
  const points: CapturePosition[] = [];
  let id = 0;
  const pitchLevels = [-90, -60, -30, 0, 30, 60, 90];
  
  for (const pitch of pitchLevels) {
    if (pitch === 90 || pitch === -90) {
      points.push({id: id++, yaw: 0, pitch, label: pitch > 0 ? 'Z+' : 'Z-'});
    } else {
      // Generate grid centered at 0° (straight ahead at start)
      // Yaw from -180 to +150 in 30° steps
      for (let yaw = -180; yaw <= 180; yaw += 30) {
        points.push({id: id++, yaw, pitch, label: `${yaw}/${pitch}`});
      }
    }
  }
  return points;
}

export const SPHERE_POSITIONS = generateRegularGrid();
export const NUM_SPHERE_SHOTS = SPHERE_POSITIONS.length;

// ── 3D Math ───────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
type Vec3 = [number, number, number];

/** Convert yaw/pitch to world direction (yaw-adjusted frame from native) */
function yawPitchToWorld(yawDeg: number, pitchDeg: number): Vec3 {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  const cosP = Math.cos(p);
  return [
    cosP * Math.sin(y),  // X (east in adjusted world)
    cosP * Math.cos(y),  // Y (north in adjusted world)
    Math.sin(p),         // Z (up)
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return len > 1e-6 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 1];
}

/** Multiply 3x3 matrix by vector */
function matVec(m: number[], v: Vec3): Vec3 {
  return [
    m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
    m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
    m[6]*v[0] + m[7]*v[1] + m[8]*v[2],
  ];
}

/** Transpose 3x3 matrix (row-major) */
function transpose(m: number[]): number[] {
  return [
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ];
}

type Projected = {x: number; y: number; inFov: boolean};

/**
 * Project world direction to screen using rotation matrix.
 * 
 * rm: device→world (row-major, yaw-offset-adjusted)
 * worldDir: target direction in world space
 * 
 * Steps:
 * 1. Transpose rm to get world→device transform
 * 2. Transform worldDir to device frame
 * 3. Project to screen (device -Z = camera forward)
 */
function projectAR(
  worldDir: Vec3,
  rm: number[],
  screenW: number,
  screenH: number,
  hFov: number,
  vFov: number,
): Projected {
  // World→device
  const w2d = transpose(rm);
  const devDir = normalize(matVec(w2d, worldDir));
  
  // Device frame: phone upright, back camera in portrait mode
  // CoreMotion rotation matrix is device→world
  // We need world→device (transpose) to transform world directions to camera frame
  // Camera coordinate system: +X right, +Y up, -Z forward (standard OpenGL/CV)
  const camZ = -devDir[2];  // forward depth (camera looks at -Z, so negate)
  const camX = devDir[0];   // horizontal (right)
  const camY = -devDir[1];  // vertical (up on screen, but need to flip for projection)
  
  const focalH = (screenW / 2) / Math.tan((hFov / 2) * DEG);
  const focalV = (screenH / 2) / Math.tan((vFov / 2) * DEG);
  
  let sx: number, sy: number;
  if (camZ > 0.01) {
    sx = screenW / 2 + focalH * (camX / camZ);
    sy = screenH / 2 - focalV * (camY / camZ);
  } else {
    sx = screenW / 2 + camX * 5000;
    sy = screenH / 2 - camY * 5000;
  }
  
  const MARGIN = 50;
  const inFov = camZ > 0.01 &&
    sx > -MARGIN && sx < screenW + MARGIN &&
    sy > -MARGIN && sy < screenH + MARGIN;
  
  return {x: sx, y: sy, inFov};
}

function angularDist(yaw1: number, pitch1: number, yaw2: number, pitch2: number): number {
  const v1 = yawPitchToWorld(yaw1, pitch1);
  const v2 = yawPitchToWorld(yaw2, pitch2);
  const d = dot(v1, v2);
  return Math.acos(Math.min(1, Math.max(-1, d))) / DEG;
}

/**
 * Simple projection: treat yaw/pitch as angles relative to current camera.
 * This avoids rotation matrix complexity and should give stable AR.
 */
function projectSimple(
  targetYaw: number,
  targetPitch: number,
  camYaw: number,
  camPitch: number,
  screenW: number,
  screenH: number,
  hFov: number,
  vFov: number,
): Projected {
  // Angular offset from camera center
  let dyaw = targetYaw - camYaw;
  // Wrap to [-180, 180]
  if (dyaw > 180) dyaw -= 360;
  if (dyaw < -180) dyaw += 360;
  const dpitch = targetPitch - camPitch;
  
  // Debug first bullseye
  if (targetYaw === 0 && targetPitch === 0) {
    console.log(`[projectSimple] Center bullseye: target=(0,0) cam=(${camYaw.toFixed(1)},${camPitch.toFixed(1)}) → offset=(${dyaw.toFixed(1)},${dpitch.toFixed(1)})`);
  }
  
  // Check if in FOV
  const inFov = Math.abs(dyaw) < hFov / 2 + 10 && Math.abs(dpitch) < vFov / 2 + 10;
  
  // Project to screen (linear approximation)
  const x = screenW / 2 + (dyaw / hFov) * screenW;
  const y = screenH / 2 - (dpitch / vFov) * screenH;
  
  return {x, y, inFov};
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOT_SIZE = 32;
const CAPTURED_DOT_SIZE = 28;
const COVER_THRESHOLD = 30;  // Increased from 20° to 30° for easier coverage detection

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  shots: ShotEntry[];
  attitude: Attitude;
  hFov: number;
  vFov: number;
};

export default function SphericalGuide({shots, attitude, hFov, vFov}: Props) {
  const {width: W, height: H} = useWindowDimensions();
  const rm = attitude.rotationMatrix;

  // Memo key from rotation matrix
  const matKey = rm?.length === 9
    ? `${rm[0].toFixed(3)},${rm[4].toFixed(3)},${rm[8].toFixed(3)}`
    : `${attitude.yaw.toFixed(1)},${attitude.pitch.toFixed(1)}`;

  // Covered guide IDs
  const coveredIds = useMemo(() => {
    const covered = new Set<number>();
    for (const pos of SPHERE_POSITIONS) {
      for (const shot of shots) {
        const dist = angularDist(pos.yaw, pos.pitch, shot.yaw, shot.pitch);
        if (dist < COVER_THRESHOLD) {
          console.log(`✓ Covered pos ${pos.id} at ${pos.yaw}°/${pos.pitch}° by shot at ${shot.yaw}°/${shot.pitch}° (dist: ${dist.toFixed(1)}°)`);
          covered.add(pos.id);
          break;
        }
      }
    }
    console.log(`[SphericalGuide] ${shots.length} shots, ${covered.size} positions covered`);
    return covered;
  }, [shots]);

  // World directions (constant)
  const worldDirs = useMemo(() => {
    return SPHERE_POSITIONS.map(pos => ({
      pos,
      worldDir: normalize(yawPitchToWorld(pos.yaw, pos.pitch)),
    }));
  }, []);

  // Project guides using simple angular projection (adjusted yaw, grid centered at 0°)
  const projectedGuides = useMemo(() => {
    return SPHERE_POSITIONS.map(pos => ({
      pos,
      ...projectSimple(pos.yaw, pos.pitch, attitude.yaw, attitude.pitch, W, H, hFov, vFov),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attitude.yaw, attitude.pitch, W, H, hFov, vFov]);

  // Project shots using simple angular projection (adjusted yaw, relative to start)
  const projectedShots = useMemo(() => {
    return shots.map((shot, idx) => ({
      idx,
      ...projectSimple(shot.yaw, shot.pitch, attitude.yaw, attitude.pitch, W, H, hFov, vFov),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, attitude.yaw, attitude.pitch, W, H, hFov, vFov]);

  const visibleGuides = projectedGuides.filter(p => p.inFov && !coveredIds.has(p.pos.id)).length;
  const visibleShots = projectedShots.filter(p => p.inFov).length;

  return (
    <View style={s.root} pointerEvents="none">
      <View style={s.debugBox}>
        <Text style={s.debugText}>
          {`yaw=${attitude.yaw.toFixed(0)}° pitch=${attitude.pitch.toFixed(0)}°`}
        </Text>
        <Text style={s.debugText}>
          {`visible: ${visibleGuides}/${SPHERE_POSITIONS.length}  shots: ${visibleShots}/${shots.length}`}
        </Text>
        {!rm && <Text style={s.debugText}>⚠️ NO ROTATION MATRIX</Text>}
      </View>

      {/* Guide dots */}
      {projectedGuides.map(({pos, x, y, inFov}) => {
        if (!inFov) return null;
        const isCovered = coveredIds.has(pos.id);
        const size = isCovered ? CAPTURED_DOT_SIZE : DOT_SIZE;
        const half = size / 2;
        return (
          <View
            key={`g-${pos.id}`}
            style={[s.dot, {
              left: x - half,
              top: y - half,
              width: size,
              height: size,
              borderRadius: size/2,
              backgroundColor: isCovered ? 'rgba(34,197,94,0.85)' : 'rgba(255,255,255,0.9)',
              borderWidth: 2,
              borderColor: isCovered ? 'rgba(34,197,94,1)' : 'rgba(255,255,255,0.6)',
            }]}>
            {isCovered ? (
              <Text style={s.checkMark}>✓</Text>
            ) : (
              <View style={s.bullseye} />
            )}
          </View>
        );
      })}

      {/* Captured shots */}
      {projectedShots.map(({idx, x, y, inFov}) => {
        if (!inFov) return null;
        const size = CAPTURED_DOT_SIZE;
        const half = size / 2;
        return (
          <View
            key={`s-${idx}`}
            style={[s.dot, {
              left: x - half,
              top: y - half,
              width: size,
              height: size,
              borderRadius: size/2,
              backgroundColor: 'rgba(34,197,94,0.85)',
              borderWidth: 2,
              borderColor: 'rgba(34,197,94,1)',
            }]}>
            <Text style={s.checkMark}>✓</Text>
          </View>
        );
      })}

      <View style={s.progressBar}>
        <Text style={s.progressText}>
          {coveredIds.size >= NUM_SPHERE_SHOTS
            ? '✓ Full coverage!'
            : `${coveredIds.size}/${NUM_SPHERE_SHOTS} covered`}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {...StyleSheet.absoluteFillObject},
  debugBox: {
    position: 'absolute',
    top: 240,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 6,
    borderRadius: 4,
    zIndex: 999,
  },
  debugText: {
    color: '#0f0',
    fontSize: 9,
    fontFamily: 'Menlo',
    lineHeight: 12,
  },
  dot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullseye: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  checkMark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  progressBar: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  progressText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
