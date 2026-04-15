//
//  RCTVideoRecorderModule.m
//  Capture360
//
//  Utility for extracting frames from recorded video files.
//  Camera preview & recording are handled by react-native-vision-camera.
//

#import "RCTVideoRecorderModule.h"
#import <React/RCTLog.h>
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>

@implementation RCTVideoRecorderModule

RCT_EXPORT_MODULE(VideoRecorder)

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

/// Extract frames from a video file at the given FPS rate.
/// Returns an array of JPEG file paths in a session directory.
RCT_EXPORT_METHOD(extractFrames:(NSString *)videoPath
                  fps:(double)fps
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"[VideoRecorder] extractFrames called: path=%@, fps=%.1f", videoPath, fps);

    NSURL *videoURL = [NSURL fileURLWithPath:videoPath];
    AVAsset *asset = [AVAsset assetWithURL:videoURL];

    // Create output directory
    NSString *docsDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0];
    NSString *sessionDir = [docsDir stringByAppendingPathComponent:
                            [NSString stringWithFormat:@"photosphere_%@", [[NSUUID UUID] UUIDString]]];
    [[NSFileManager defaultManager] createDirectoryAtPath:sessionDir
                              withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];

    // Use AVAssetImageGenerator for frame extraction
    AVAssetImageGenerator *generator = [[AVAssetImageGenerator alloc] initWithAsset:asset];
    generator.appliesPreferredTrackTransform = YES;
    generator.requestedTimeToleranceBefore = kCMTimeZero;
    generator.requestedTimeToleranceAfter  = kCMTimeZero;
    // Keep full resolution
    generator.maximumSize = CGSizeZero;

    Float64 durationSec = CMTimeGetSeconds(asset.duration);
    if (durationSec <= 0) {
        reject(@"invalid_video", @"Video has zero duration", nil);
        return;
    }

    double interval = 1.0 / fps;
    NSMutableArray<NSValue *> *times = [NSMutableArray array];
    for (Float64 t = 0; t < durationSec; t += interval) {
        CMTime time = CMTimeMakeWithSeconds(t, 600);
        [times addObject:[NSValue valueWithCMTime:time]];
    }

    NSLog(@"[VideoRecorder] Extracting %lu frames over %.1fs", (unsigned long)times.count, durationSec);

    NSMutableArray *framePaths = [NSMutableArray array];
    __block int completed = 0;
    int total = (int)times.count;

    [generator generateCGImagesAsynchronouslyForTimes:times
                                    completionHandler:^(CMTime requestedTime,
                                                        CGImageRef _Nullable cgImage,
                                                        CMTime actualTime,
                                                        AVAssetImageGeneratorResult result,
                                                        NSError * _Nullable error) {
        if (result == AVAssetImageGeneratorSucceeded && cgImage) {
            UIImage *image = [UIImage imageWithCGImage:cgImage];
            NSString *framePath = [sessionDir stringByAppendingPathComponent:
                                   [NSString stringWithFormat:@"frame_%04d.jpg", completed]];
            NSData *jpegData = UIImageJPEGRepresentation(image, 0.9);
            [jpegData writeToFile:framePath atomically:YES];

            @synchronized (framePaths) {
                [framePaths addObject:@{
                    @"path": framePath,
                    @"timestamp": @(CMTimeGetSeconds(actualTime)),
                }];
            }
        } else if (error) {
            NSLog(@"[VideoRecorder] Frame extraction error at %.2fs: %@",
                  CMTimeGetSeconds(requestedTime), error.localizedDescription);
        }

        completed++;

        if (completed == total) {
            // Sort by timestamp
            NSArray *sorted = [framePaths sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
                return [a[@"timestamp"] compare:b[@"timestamp"]];
            }];

            NSLog(@"[VideoRecorder] Extraction complete: %lu frames", (unsigned long)sorted.count);
            resolve(@{
                @"success": @YES,
                @"frameCount": @(sorted.count),
                @"frames": sorted,
                @"sessionDir": sessionDir,
                @"duration": @(durationSec),
            });
        }
    }];
}

RCT_EXPORT_METHOD(testModule:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"[VideoRecorder] testModule called!");
    resolve(@{@"success": @YES, @"message": @"Module is working!"});
}

RCT_EXPORT_METHOD(requestCameraPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
    if (status == AVAuthorizationStatusAuthorized) {
        resolve(@"granted");
        return;
    }
    if (status == AVAuthorizationStatusDenied || status == AVAuthorizationStatusRestricted) {
        resolve(@"denied");
        return;
    }
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
        resolve(granted ? @"granted" : @"denied");
    }];
}

@end
