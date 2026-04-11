//
//  ARCameraViewManager.m
//  BisetkaPhotosphere
//
//  RCTViewManager that exposes ARCameraView to React Native.
//

#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
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

RCT_EXPORT_METHOD(captureFrame:(nonnull NSNumber *)reactTag) {
    [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
        ARCameraView *view = (ARCameraView *)viewRegistry[reactTag];
        if ([view isKindOfClass:[ARCameraView class]]) {
            [view captureFrame];
        } else {
            NSLog(@"[ARCameraViewManager] captureFrame: invalid view for tag %@", reactTag);
        }
    }];
}

@end
