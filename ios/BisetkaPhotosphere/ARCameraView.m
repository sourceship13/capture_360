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

    NSString *docsDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0];
    _sessionDir = [docsDir stringByAppendingPathComponent:
                   [NSString stringWithFormat:@"photosphere_%@", [[NSUUID UUID] UUIDString]]];
    [[NSFileManager defaultManager] createDirectoryAtPath:_sessionDir
                              withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];
}

- (void)endFrameCapture {
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
            self.onOrientationUpdate(@{
                @"yaw":   @(yaw),
                @"pitch": @(pitch),
                @"roll":  @(roll),
                @"timestamp": @(now),
            });
        }
    }

    // --- Capture frames at ~2 fps while recording ---
    if (_isRecording && (now - _lastFrameCapture >= 0.5)) {
        _lastFrameCapture = now;

        CVPixelBufferRef pixelBuffer = frame.capturedImage;
        if (!pixelBuffer) return;

        CIImage *ciImage = [CIImage imageWithCVPixelBuffer:pixelBuffer];
        CGImageRef cgImage = [_ciContext createCGImage:ciImage fromRect:ciImage.extent];
        if (!cgImage) return;

        // Sensor is landscape-right; tag as Right so NormaliseOrientation
        // rotates pixels to correct portrait orientation before warping.
        UIImage *image = [UIImage imageWithCGImage:cgImage
                                             scale:1.0
                                       orientation:UIImageOrientationRight];
        CGImageRelease(cgImage);

        int idx;
        @synchronized (_capturedFrames) {
            idx = (int)_capturedFrames.count;
        }

        NSString *framePath = [_sessionDir stringByAppendingPathComponent:
                               [NSString stringWithFormat:@"frame_%04d.jpg", idx]];
        NSData *jpegData = UIImageJPEGRepresentation(image, 0.9);
        [jpegData writeToFile:framePath atomically:YES];

        NSDictionary *entry = @{
            @"path":      framePath,
            @"yaw":       @(yaw),
            @"pitch":     @(pitch),
            @"roll":      @(roll),
            @"timestamp": @(now),
        };

        @synchronized (_capturedFrames) {
            [_capturedFrames addObject:entry];
        }

        NSLog(@"[ARCameraView] Frame %d: yaw=%.1f° pitch=%.1f°", idx, yaw, pitch);
    }
}

@end
