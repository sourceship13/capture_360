//
//  ARCameraView.h
//  BisetkaPhotosphere
//
//  Native camera preview using ARKit for live feed + frame capture with pose data.
//  Replaces react-native-vision-camera to avoid AVCaptureSession conflicts.
//

#import <UIKit/UIKit.h>
#import <React/RCTComponent.h>

@interface ARCameraView : UIView

@property (nonatomic, assign) BOOL isRecording;
@property (nonatomic, copy) RCTDirectEventBlock onOrientationUpdate;
@property (nonatomic, copy) RCTDirectEventBlock onRecordingComplete;

- (void)captureFrame;
- (void)captureFrameWithGridRow:(int)gridRow gridCol:(int)gridCol targetYaw:(double)targetYaw targetPitch:(double)targetPitch;

@end
