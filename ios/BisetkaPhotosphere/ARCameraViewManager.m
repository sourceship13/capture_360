//
//  ARCameraViewManager.m
//  BisetkaPhotosphere
//
//  RCTViewManager that exposes ARCameraView to React Native.
//

#import <React/RCTViewManager.h>
#import "ARCameraView.h"

@interface ARCameraViewManager : RCTViewManager
@end

@implementation ARCameraViewManager

RCT_EXPORT_MODULE(ARCameraView)

- (UIView *)view {
    return [[ARCameraView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(isRecording, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onOrientationUpdate, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRecordingComplete, RCTDirectEventBlock)

@end
