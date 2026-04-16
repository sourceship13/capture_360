/**
 * useS3Upload — React hook for uploading capture sessions
 * and processed images to the bisetka_capture360_raw S3 bucket.
 */

import {useCallback, useRef, useState} from 'react';
import {
  uploadSession,
  uploadProcessedImage,
  type FrameInfo,
  type SessionUploadProgress,
} from '../modules/S3Upload';

export type UploadStatus =
  | {state: 'idle'}
  | {state: 'uploading'; progress: SessionUploadProgress}
  | {state: 'done'; sessionId: string; manifestKey: string}
  | {state: 'error'; message: string};

export interface UseS3UploadReturn {
  status: UploadStatus;
  /** Upload all frames + metadata for a capture session. */
  uploadFrames: (sessionId: string, frames: FrameInfo[]) => Promise<void>;
  /** Upload the stitched equirectangular image for a session. */
  uploadEquirect: (sessionId: string, localPath: string) => Promise<string | null>;
  /** Reset status back to idle. */
  resetUpload: () => void;
}

export function useS3Upload(): UseS3UploadReturn {
  const [status, setStatus] = useState<UploadStatus>({state: 'idle'});
  const abortRef = useRef(false);

  const uploadFrames = useCallback(
    async (sessionId: string, frames: FrameInfo[]) => {
      abortRef.current = false;
      setStatus({
        state: 'uploading',
        progress: {total: frames.length + 1, completed: 0, currentFile: ''},
      });

      try {
        const result = await uploadSession(sessionId, frames, progress => {
          if (abortRef.current) return;
          setStatus({state: 'uploading', progress});
        });

        if (!abortRef.current) {
          setStatus({
            state: 'done',
            sessionId,
            manifestKey: result.manifestKey,
          });
        }
      } catch (err: any) {
        if (!abortRef.current) {
          console.error('[useS3Upload] Upload failed:', err);
          setStatus({state: 'error', message: err.message ?? 'Upload failed'});
        }
      }
    },
    [],
  );

  const uploadEquirect = useCallback(
    async (sessionId: string, localPath: string): Promise<string | null> => {
      try {
        const s3Uri = await uploadProcessedImage(sessionId, localPath);
        console.log('[useS3Upload] Equirect uploaded:', s3Uri);
        return s3Uri;
      } catch (err: any) {
        console.error('[useS3Upload] Equirect upload failed:', err);
        return null;
      }
    },
    [],
  );

  const resetUpload = useCallback(() => {
    abortRef.current = true;
    setStatus({state: 'idle'});
  }, []);

  return {status, uploadFrames, uploadEquirect, resetUpload};
}
