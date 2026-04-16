/**
 * S3Upload — upload frames and processed images to the
 * `bisetka_capture360_raw` S3 bucket.
 *
 * Depends on @aws-sdk/client-s3.
 */

import {
  S3Client,
  PutObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import {Platform} from 'react-native';
import RNFS from 'react-native-fs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface S3UploadConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket?: string;
}

const BUCKET = 'bisetka_capture360_raw';

let _client: S3Client | null = null;
let _config: S3UploadConfig | null = null;

/** Initialise (or re-initialise) the S3 client. Call once at app start. */
export function configureS3(config: S3UploadConfig): void {
  _config = config;
  _client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function getClient(): S3Client {
  if (!_client) {
    throw new Error(
      '[S3Upload] S3 client not initialised – call configureS3() first',
    );
  }
  return _client;
}

function getBucket(): string {
  return _config?.bucket ?? BUCKET;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readFileAsBase64(filePath: string): Promise<string> {
  return RNFS.readFile(filePath, 'base64');
}

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Single-file upload
// ---------------------------------------------------------------------------

export async function uploadFile(
  localPath: string,
  s3Key: string,
): Promise<string> {
  const client = getClient();
  const base64 = await readFileAsBase64(localPath);
  const body = base64ToUint8Array(base64);
  const contentType = contentTypeForPath(localPath);

  const params: PutObjectCommandInput = {
    Bucket: getBucket(),
    Key: s3Key,
    Body: body,
    ContentType: contentType,
  };

  await client.send(new PutObjectCommand(params));
  return `s3://${getBucket()}/${s3Key}`;
}

// ---------------------------------------------------------------------------
// Upload raw JSON metadata
// ---------------------------------------------------------------------------

export async function uploadJSON(
  data: unknown,
  s3Key: string,
): Promise<string> {
  const client = getClient();
  const body = JSON.stringify(data, null, 2);

  const params: PutObjectCommandInput = {
    Bucket: getBucket(),
    Key: s3Key,
    Body: body,
    ContentType: 'application/json',
  };

  await client.send(new PutObjectCommand(params));
  return `s3://${getBucket()}/${s3Key}`;
}

// ---------------------------------------------------------------------------
// Batch upload: frames + metadata for a capture session
// ---------------------------------------------------------------------------

export interface FrameInfo {
  path: string;
  yaw: number;
  pitch: number;
  roll?: number;
  hFov?: number;
  timestamp?: number;
  fx?: number;
  fy?: number;
  cx?: number;
  cy?: number;
  imageWidth?: number;
  imageHeight?: number;
  rotationMatrix?: number[];
}

export interface SessionUploadProgress {
  total: number;
  completed: number;
  currentFile: string;
}

export type ProgressCallback = (progress: SessionUploadProgress) => void;

/**
 * Upload all frames from a capture session plus a metadata manifest.
 *
 * S3 key layout:
 *   sessions/{sessionId}/frames/frame_0000.jpg
 *   sessions/{sessionId}/metadata.json
 */
export async function uploadSession(
  sessionId: string,
  frames: FrameInfo[],
  onProgress?: ProgressCallback,
): Promise<{manifestKey: string; frameKeys: string[]}> {
  const prefix = `sessions/${sessionId}`;
  const total = frames.length + 1; // +1 for metadata
  let completed = 0;
  const frameKeys: string[] = [];

  // Upload each frame
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const filename = frame.path.split('/').pop() ?? `frame_${String(i).padStart(4, '0')}.jpg`;
    const s3Key = `${prefix}/frames/${filename}`;

    onProgress?.({total, completed, currentFile: filename});
    await uploadFile(frame.path, s3Key);
    frameKeys.push(s3Key);
    completed++;
  }

  // Build and upload metadata manifest
  const manifest = {
    sessionId,
    platform: Platform.OS,
    uploadedAt: new Date().toISOString(),
    frameCount: frames.length,
    frames: frames.map((f, i) => ({
      s3Key: frameKeys[i],
      yaw: f.yaw,
      pitch: f.pitch,
      roll: f.roll,
      hFov: f.hFov,
      timestamp: f.timestamp,
      fx: f.fx,
      fy: f.fy,
      cx: f.cx,
      cy: f.cy,
      imageWidth: f.imageWidth,
      imageHeight: f.imageHeight,
      rotationMatrix: f.rotationMatrix,
    })),
  };

  const manifestKey = `${prefix}/metadata.json`;
  onProgress?.({total, completed, currentFile: 'metadata.json'});
  await uploadJSON(manifest, manifestKey);
  completed++;
  onProgress?.({total, completed, currentFile: ''});

  return {manifestKey, frameKeys};
}

/**
 * Upload the processed equirectangular image for an existing session.
 *
 * S3 key: sessions/{sessionId}/equirectangular.{ext}
 */
export async function uploadProcessedImage(
  sessionId: string,
  localPath: string,
): Promise<string> {
  const ext = localPath.split('.').pop() ?? 'png';
  const s3Key = `sessions/${sessionId}/equirectangular.${ext}`;
  return uploadFile(localPath, s3Key);
}
