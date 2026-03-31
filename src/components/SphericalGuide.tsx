/**
 * SphericalGuide — AR-style overlay that projects 16 capture dots in 3D space
 * based on the device's gyroscope attitude.
 *
 * Uses proper gnomonic (rectilinear) projection with 3D camera basis vectors
 * so dots are pinned to fixed world positions and don't drift.
 */
import React, {useMemo} from 'react';
import {View, Text, StyleSheet, useWindowDimensions} from 'react-native';
import type {Attitude} from '../hooks/useAttitude';

// ── Capture positions ─────────────────────────────────────────────────────────

export type CapturePosition = {
  id: number;
  yaw: number;   // degrees, 0 = start direction, clockwise
  pitch: number;  // degrees, 0 = horizon, + = up, - = down
  label: string;
  ring: 'zenith' | 'upper' | 'horizon' | 'lower' | 'nadir';
};

export const SPHERE_POSITIONS: CapturePosition[] = [
  // Horizon ring (0° pitch) — 6 shots at 60° intervals
  {id: 0, yaw: 0, pitch: 0, label: 'Front', ring: 'horizon'},
  {id: 1, yaw: 60, pitch: 0, label: 'Front-Right', ring: 'horizon'},
  {id: 2, yaw: 120, pitch: 0, label: 'Right-Back', ring: 'horizon'},
  {id: 3, yaw: 180, pitch: 0, label: 'Back', ring: 'horizon'},
  {id: 4, yaw: 240, pitch: 0, label: 'Back-Left', ring: 'horizon'},
  {id: 5, yaw: 300, pitch: 0, label: 'Left', ring: 'horizon'},
  // Upper ring (+45° pitch) — 4 shots at 90° intervals
  {id: 6, yaw: 0, pitch: 45, label: 'Front-Up', ring: 'upper'},
  {id: 7, yaw: 90, pitch: 45, label: 'Right-Up', ring: 'upper'},
  {id: 8, yaw: 180, pitch: 45, label: 'Back-Up', ring: 'upper'},
  {id: 9, yaw: 270, pitch: 45, label: 'Left-Up', ring: 'upper'},
  // Lower ring (-45° pitch) — 4 shots at 90° intervals
  {id: 10, yaw: 0, pitch: -45, label: 'Front-Down', ring: 'lower'},
  {id: 11, yaw: 90, pitch: -45, label: 'Right-Down', ring: 'lower'},
  {id: 12, yaw: 180, pitch: -45, label: 'Back-Down', ring: 'lower'},
  {id: 13, yaw: 270, pitch: -45, label: 'Left-Down', ring: 'lower'},
  // Zenith & Nadir
  {id: 14, yaw: 0, pitch: 90, label: 'Straight Up ↑', ring: 'zenith'},
  {id: 15, yaw: 0, pitch: -90, label: 'Straight Down ↓', ring: 'nadir'},
];

export const NUM_SPHERE_SHOTS = SPHERE_POSITIONS.length;

// ── 3D Gnomonic Projection ───────────────────────────────────────────────────

const DEG = Math.PI / 180;

/**
 * Convert (yaw, pitch) in degrees to a 3D unit vector.
 * Convention: Y=up, yaw=0/pitch=0→(0,0,1), yaw increases right.
 */
function toVec3(yawDeg: number, pitchDeg: number): [number, number, number] {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  return [
    Math.cos(p) * Math.sin(y), // X (right)
    Math.sin(p),                // Y (up)
    Math.cos(p) * Math.cos(y), // Z (forward)
  ];
}

type Projected = {
  x: number;
  y: number;
  inFov: boolean;   // true when within camera FOV (render at full size)
  angDist: number;  // angular distance from camera centre (degrees)
};

/**
 * Project a world-space dot onto screen using gnomonic (rectilinear)
 * projection — the same model a real camera lens uses.
 */
function projectToScreen(
  posYaw: number,
  posPitch: number,
  attitude: Attitude,
  screenW: number,
  screenH: number,
  hFov: number,
  vFov: number,
): Projected {
  // Dot direction in world space
  const [dx, dy, dz] = toVec3(posYaw, posPitch);

  let fx: number, fy: number, fz: number;
  let rx: number, ry: number, rz: number;
  let ux: number, uy: number, uz: number;

  const rm = attitude.rotationMatrix;
  if (rm && rm.length === 9) {
    // Camera forward (world→JS) = R' * device(0,0,-1)
    fx = -rm[2]; fy = -rm[8]; fz = -rm[5];
    // Screen right  = R' * device(1,0,0)
    rx = rm[0]; ry = rm[6]; rz = rm[3];
    // Screen up     = R' * device(0,1,0)
    ux = rm[1]; uy = rm[7]; uz = rm[4];
  } else {
    // Fallback: compute from yaw/pitch (no roll compensation)
    [fx, fy, fz] = toVec3(attitude.yaw, attitude.pitch);
    const camYawRad = attitude.yaw * DEG;
    rx = Math.cos(camYawRad);
    ry = 0;
    rz = -Math.sin(camYawRad);
    const camPitchRad = attitude.pitch * DEG;
    ux = -Math.sin(camPitchRad) * Math.sin(camYawRad);
    uy = Math.cos(camPitchRad);
    uz = -Math.sin(camPitchRad) * Math.cos(camYawRad);
  }

  // Dot product with forward = cosine of angle between camera and dot
  const dotFwd = dx * fx + dy * fy + dz * fz;
  const angDist = Math.acos(Math.min(1, Math.max(-1, dotFwd))) / DEG;

  const dotRight = dx * rx + dy * ry + dz * rz;
  const dotUp = dx * ux + dy * uy + dz * uz;

  // Focal length in pixels (from visible camera FOV)
  const focalH = (screenW / 2) / Math.tan((hFov / 2) * DEG);
  const focalV = (screenH / 2) / Math.tan((vFov / 2) * DEG);

  let sx: number;
  let sy: number;

  if (dotFwd > 0.05) {
    // Valid gnomonic projection (dot is in front of camera)
    sx = screenW / 2 + focalH * (dotRight / dotFwd);
    sy = screenH / 2 - focalV * (dotUp / dotFwd);
  } else {
    // Behind camera — place in raw direction (will be clamped to edge)
    sx = screenW / 2 + dotRight * 2000;
    sy = screenH / 2 - dotUp * 2000;
  }

  // Determine if within camera FOV
  const maxAng = Math.max(hFov, vFov) / 2 + 3;
  const inFov = angDist < maxAng && dotFwd > 0.05;

  // For off-FOV dots, clamp to screen edges preserving direction from centre
  if (!inFov) {
    const cx = screenW / 2;
    const cy = screenH / 2;
    const dirX = sx - cx;
    const dirY = sy - cy;
    const edgeX = cx - EDGE_MARGIN;
    const edgeY = cy - EDGE_MARGIN;
    const scale = Math.min(
      Math.abs(dirX) > 0.1 ? edgeX / Math.abs(dirX) : Infinity,
      Math.abs(dirY) > 0.1 ? edgeY / Math.abs(dirY) : Infinity,
      1,
    );
    if (scale < 1) {
      sx = cx + dirX * scale;
      sy = cy + dirY * scale;
    }
  }

  return {x: sx, y: sy, inFov, angDist};
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOT_SIZE = 36;
const TARGET_SIZE = 48;
const EDGE_DOT_SIZE = 22;
const ALIGN_THRESHOLD = 8;
const EDGE_MARGIN = 28;

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  capturedIds: Set<number>;
  attitude: Attitude;
  hFov: number;
  vFov: number;
  onAligned?: (aligned: boolean, positionId: number | null) => void;
};

export default function SphericalGuide({
  capturedIds,
  attitude,
  hFov,
  vFov,
  onAligned,
}: Props) {
  const {width: W, height: H} = useWindowDimensions();
  const captured = capturedIds.size;

  const rm = attitude.rotationMatrix;
  const matKey = rm ? rm.join(',') : `${attitude.yaw},${attitude.pitch}`;

  // Project all 16 dots (always — even off-screen ones are clamped to edges)
  const projected = useMemo(() => {
    return SPHERE_POSITIONS.map(pos => ({
      pos,
      ...projectToScreen(pos.yaw, pos.pitch, attitude, W, H, hFov, vFov),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matKey, W, H, hFov, vFov]);

  // Find the uncaptured position closest to camera center (any order)
  const alignedId = useMemo(() => {
    let bestId: number | null = null;
    let bestDist = ALIGN_THRESHOLD;
    for (const p of projected) {
      if (capturedIds.has(p.pos.id)) continue;
      if (p.angDist < bestDist) {
        bestDist = p.angDist;
        bestId = p.pos.id;
      }
    }
    return bestId;
  }, [projected, capturedIds]);

  const isAligned = alignedId != null;
  const allDone = captured >= NUM_SPHERE_SHOTS;

  React.useEffect(() => {
    onAligned?.(isAligned, alignedId);
  }, [isAligned, alignedId, onAligned]);

  return (
    <View style={s.root} pointerEvents="none">
      {/* ── All 16 dots — always rendered ─────────────────────────────── */}
      {projected.map(({pos, x, y, inFov}) => {
        const isCaptured = capturedIds.has(pos.id);
        const isCurrent = pos.id === alignedId && !isCaptured;

        // Larger for in-FOV, smaller edge indicators for off-screen
        const size = isCurrent
          ? TARGET_SIZE
          : inFov
            ? DOT_SIZE
            : EDGE_DOT_SIZE;
        const half = size / 2;

        return (
          <View
            key={pos.id}
            style={[
              s.arDot,
              {
                left: x - half,
                top: y - half,
                width: size,
                height: size,
                borderRadius: size / 2,
                opacity: inFov ? 1 : 0.55,
                backgroundColor: isCaptured
                  ? 'rgba(34,197,94,0.85)'
                  : '#fff',
                borderWidth: isCurrent ? 4 : 2,
                borderColor: isCaptured
                  ? 'rgba(34,197,94,1)'
                  : isCurrent
                    ? 'rgba(99,102,241,1)'
                    : 'rgba(255,255,255,0.6)',
              },
            ]}>
            {isCurrent && <View style={s.targetInner} />}
            {isCaptured && (
              <Text
                style={[
                  s.checkMark,
                  !inFov && {fontSize: 13},
                ]}>
                ✓
              </Text>
            )}
          </View>
        );
      })}

      {/* ── Bottom info bar ───────────────────────────────────────────── */}
      <View style={s.infoContainer}>
        <Text style={s.progressText}>
          {allDone
            ? '✓ All positions captured!'
            : `${captured} / ${NUM_SPHERE_SHOTS} captured`}
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
  arDot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(99,102,241,1)',
  },
  checkMark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  progressText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
  },
});
