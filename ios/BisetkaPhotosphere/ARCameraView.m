//
//  ARCameraView.m
//  BisetkaPhotosphere
//
//  ARSCNView-backed camera preview with ARKit world tracking.
//  Captures frames at ~2fps with synchronized camera pose for stitching.
//

#import "ARCameraView.h"
#import <ARKit/ARKit.h>
#import <SceneKit/SceneKit.h>
#import <React/RCTLog.h>

static inline float CLAMP(float x, float lo, float hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

@interface ARCameraView () <ARSessionDelegate>
@end

@implementation ARCameraView {
    ARSCNView *_arView;
    NSMutableArray *_capturedFrames;
    CIContext *_ciContext;
    NSString *_sessionDir;
    NSTimeInterval _lastOrientationSend;
    NSTimeInterval _lastFrameCapture;
}

- (instancetype)initWithFrame:(CGRect)frame {
    if (self = [super initWithFrame:frame]) {
        _capturedFrames = [NSMutableArray array];
        _ciContext = [CIContext contextWithOptions:nil];
        _lastOrientationSend = 0;
        _lastFrameCapture = 0;

        _arView = [[ARSCNView alloc] initWithFrame:self.bounds];
        _arView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        _arView.session.delegate = self;
        [self addSubview:_arView];

        // Start AR world tracking
        ARWorldTrackingConfiguration *config = [[ARWorldTrackingConfiguration alloc] init];
        config.worldAlignment = ARWorldAlignmentGravity;
        [_arView.session runWithConfiguration:config];

        NSLog(@"[ARCameraView] Initialized – AR session running");
    }
    return self;
}

- (void)removeFromSuperview {
    [_arView.session pause];
    NSLog(@"[ARCameraView] AR session paused (view removed)");
    [super removeFromSuperview];
}

- (void)dealloc {
    [_arView.session pause];
}

#pragma mark - Recording prop

- (void)setIsRecording:(BOOL)isRecording {
    if (_isRecording == isRecording) return;
    _isRecording = isRecording;

    if (isRecording) {
        [self beginFrameCapture];
    } else {
        [self endFrameCapture];
    }
}

- (void)beginFrameCapture {
    NSLog(@"[ARCameraView] Frame capture started");
    @synchronized (_capturedFrames) {
        [_capturedFrames removeAllObjects];
    }
    _lastFrameCapture = 0;

    // Lock exposure + white balance using Custom mode (works with ARKit)
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        AVCaptureDevice *device = [AVCaptureDevice defaultDeviceWithDeviceType:AVCaptureDeviceTypeBuiltInWideAngleCamera
                                                                    mediaType:AVMediaTypeVideo
                                                                     position:AVCaptureDevicePositionBack];
        if (device && [device lockForConfiguration:nil]) {
            if ([device isExposureModeSupported:AVCaptureExposureModeCustom]) {
                CMTime duration = device.exposureDuration;
                float iso = device.ISO;
                [device setExposureModeCustomWithDuration:duration ISO:iso completionHandler:nil];
                NSLog(@"[ARCameraView] Custom exposure locked: ISO=%.0f duration=%.4fs", iso, CMTimeGetSeconds(duration));
            }
            if ([device isWhiteBalanceModeSupported:AVCaptureWhiteBalanceModeLocked]) {
                device.whiteBalanceMode = AVCaptureWhiteBalanceModeLocked;
            }
            [device unlockForConfiguration];
        }
    });

    NSString *docsDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0];
    _sessionDir = [docsDir stringByAppendingPathComponent:
                   [NSString stringWithFormat:@"photosphere_%@", [[NSUUID UUID] UUIDString]]];
    [[NSFileManager defaultManager] createDirectoryAtPath:_sessionDir
                              withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];
}

- (void)endFrameCapture {
    // Unlock exposure + white balance
    AVCaptureDevice *device = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
    if (device) {
        NSError *err;
        if ([device lockForConfiguration:&err]) {
            if ([device isExposureModeSupported:AVCaptureExposureModeContinuousAutoExposure])
                device.exposureMode = AVCaptureExposureModeContinuousAutoExposure;
            if ([device isWhiteBalanceModeSupported:AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance])
                device.whiteBalanceMode = AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance;
            [device unlockForConfiguration];
            NSLog(@"[ARCameraView] Exposure + WB unlocked");
        }
    }

    NSArray *frames;
    @synchronized (_capturedFrames) {
        frames = [_capturedFrames copy];
        [_capturedFrames removeAllObjects];
    }

    NSLog(@"[ARCameraView] Frame capture stopped – %lu frames saved", (unsigned long)frames.count);

    if (self.onRecordingComplete) {
        self.onRecordingComplete(@{
            @"frameCount": @(frames.count),
            @"frames": frames,
            @"sessionDir": _sessionDir ?: @"",
        });
    }
}

#pragma mark - ARSessionDelegate

- (void)session:(ARSession *)session didUpdateFrame:(ARFrame *)frame {
    NSTimeInterval now = frame.timestamp;

    // --- Extract orientation from ARKit camera transform ---
    simd_float4x4 t = frame.camera.transform;

    simd_float3 forward = simd_make_float3(-t.columns[2].x,
                                           -t.columns[2].y,
                                           -t.columns[2].z);
    float yaw   = atan2f(forward.x, forward.z) * 180.0f / M_PI;
    float pitch  = asinf(CLAMP(-forward.y, -1.0f, 1.0f)) * 180.0f / M_PI;

    simd_float3 up = simd_make_float3(t.columns[1].x,
                                      t.columns[1].y,
                                      t.columns[1].z);
    float roll = atan2f(up.x, up.y) * 180.0f / M_PI;

    // --- Send orientation to JS (~10 Hz) ---
    if (now - _lastOrientationSend >= 0.1) {
        _lastOrientationSend = now;
        if (self.onOrientationUpdate) {
            NSUInteger capturedCount;
            @synchronized (_capturedFrames) {
                capturedCount = _capturedFrames.count;
            }
            self.onOrientationUpdate(@{
                @"yaw":   @(yaw),
                @"pitch": @(pitch),
                @"roll":  @(roll),
                @"capturedCount": @(capturedCount),
                @"timestamp": @(now),
            });
        }
    }
}

#pragma mark - Manual frame capture

- (void)captureFrame {
    ARFrame *frame = _arView.session.currentFrame;
    if (!frame) return;

    simd_float4x4 t = frame.camera.transform;
    simd_float3 forward = simd_make_float3(-t.columns[2].x,
                                           -t.columns[2].y,
                                           -t.columns[2].z);
    float yaw   = atan2f(forward.x, forward.z) * 180.0f / M_PI;
    float pitch  = asinf(CLAMP(-forward.y, -1.0f, 1.0f)) * 180.0f / M_PI;
    float roll = atan2f(t.columns[1].x, t.columns[1].y) * 180.0f / M_PI;

    CVPixelBufferRef pixelBuffer = frame.capturedImage;
    if (!pixelBuffer) return;

    CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
    CIImage *ciImage = [CIImage imageWithCVPixelBuffer:pixelBuffer];
    CGImageRef cgImage = [_ciContext createCGImage:ciImage fromRect:ciImage.extent];
    CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
    if (!cgImage) return;

    // Always save in native sensor orientation (landscape).
    // The ARKit rotation matrix encodes the full camera pose,
    // so the warping code handles all orientation via the matrix.
    UIImage *image = [UIImage imageWithCGImage:cgImage
                                         scale:1.0
                                   orientation:UIImageOrientationUp];
    CGImageRelease(cgImage);

    simd_float3x3 K = frame.camera.intrinsics;
    CGSize res = frame.camera.imageResolution;
    float fx_intrinsic = K.columns[0][0];
    float fy_intrinsic = K.columns[1][1];
    float cx_intrinsic = K.columns[2][0];
    float cy_intrinsic = K.columns[2][1];
    float hFovDeg = 2.0f * atan2f((float)res.width, 2.0f * fx_intrinsic) * 180.0f / M_PI;

    NSArray *rotMatrix = @[
        @(t.columns[0][0]), @(t.columns[0][1]), @(t.columns[0][2]),
        @(t.columns[1][0]), @(t.columns[1][1]), @(t.columns[1][2]),
        @(-t.columns[2][0]), @(-t.columns[2][1]), @(-t.columns[2][2])
    ];

    int idx;
    @synchronized (_capturedFrames) {
        idx = (int)_capturedFrames.count;
    }

    NSString *framePath = [_sessionDir stringByAppendingPathComponent:
                           [NSString stringWithFormat:@"frame_%04d.jpg", idx]];
    NSData *jpegData = UIImageJPEGRepresentation(image, 0.95);
    [jpegData writeToFile:framePath atomically:YES];

    NSDictionary *entry = @{
        @"path":      framePath,
        @"yaw":       @(yaw),
        @"pitch":     @(pitch),
        @"roll":      @(roll),
        @"hFov":      @(hFovDeg),
        @"rotationMatrix": rotMatrix,
        @"timestamp": @(frame.timestamp),
        @"fx":        @(fx_intrinsic),
        @"fy":        @(fy_intrinsic),
        @"cx":        @(cx_intrinsic),
        @"cy":        @(cy_intrinsic),
        @"imageWidth":  @(res.width),
        @"imageHeight": @(res.height),
    };

    @synchronized (_capturedFrames) {
        [_capturedFrames addObject:entry];
    }

    // Notify JS of capture
    if (self.onOrientationUpdate) {
        self.onOrientationUpdate(@{
            @"yaw": @(yaw), @"pitch": @(pitch), @"roll": @(roll),
            @"capturedCount": @(idx + 1), @"timestamp": @(frame.timestamp),
        });
    }

    NSLog(@"[ARCameraView] Manual capture %d: yaw=%.1f° pitch=%.1f° hFov=%.1f°", idx, yaw, pitch, hFovDeg);
}

@end
