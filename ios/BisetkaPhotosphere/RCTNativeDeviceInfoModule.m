#import "RCTNativeDeviceInfoModule.h"
#import <UIKit/UIKit.h>
#import <sys/utsname.h>
#import <CoreMotion/CoreMotion.h>

@implementation RCTNativeDeviceInfoModule {
  CMMotionManager *_motionManager;
  BOOL _hasListeners;
  double _yawOffset;
  BOOL _yawOffsetCaptured;
}

RCT_EXPORT_MODULE(NativeDeviceInfo)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

// --- Constants ---
- (NSDictionary *)constantsToExport {
  NSString *appVersion = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"unknown";
  NSString *buildNumber = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @"unknown";

  return @{
    @"platform": @"ios",
    @"appVersion": appVersion,
    @"buildNumber": buildNumber,
  };
}

// --- Synchronous method ---
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getDeviceName) {
  struct utsname systemInfo;
  uname(&systemInfo);
  NSString *deviceModel = [NSString stringWithCString:systemInfo.machine encoding:NSUTF8StringEncoding];
  return deviceModel;
}

// --- Async / Promise method ---
RCT_EXPORT_METHOD(getBatteryLevel:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIDevice currentDevice].batteryMonitoringEnabled = YES;
    float level = [UIDevice currentDevice].batteryLevel;
    resolve(@((double)level));
  });
}

// --- Method with arguments returning a Promise ---
RCT_EXPORT_METHOD(multiply:(double)a
                  b:(double)b
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  resolve(@(a * b));
}

// --- Callback method ---
RCT_EXPORT_METHOD(getDeviceLocale:(RCTResponseSenderBlock)callback) {
  NSString *locale = [[NSLocale currentLocale] localeIdentifier];
  callback(@[locale]);
}

// --- Event emitter support ---
- (NSArray<NSString *> *)supportedEvents {
  return @[@"onDeviceEvent", @"onAttitude"];
}

- (void)startObserving {
  _hasListeners = YES;
}

- (void)stopObserving {
  _hasListeners = NO;
}

// --- Motion tracking ---
RCT_EXPORT_METHOD(startAttitudeUpdates) {
  _yawOffsetCaptured = NO; // Reset so yaw starts at 0 for each session
  if (!_motionManager) {
    _motionManager = [[CMMotionManager alloc] init];
  }
  if (_motionManager.isDeviceMotionAvailable && !_motionManager.isDeviceMotionActive) {
    _motionManager.deviceMotionUpdateInterval = 1.0 / 30.0; // 30 Hz
    [_motionManager startDeviceMotionUpdatesUsingReferenceFrame:CMAttitudeReferenceFrameXArbitraryZVertical
                                                       toQueue:[NSOperationQueue mainQueue]
                                                   withHandler:^(CMDeviceMotion *motion, NSError *error) {
      if (!self->_hasListeners || !motion) return;

      // Use rotation matrix to derive stable camera yaw/pitch.
      // Euler angles suffer from gimbal lock when the phone is upright.
      CMRotationMatrix m = motion.attitude.rotationMatrix;

      // Back camera points in device -Z direction: (0, 0, -1) in device frame.
      // Transform to world frame: camera_world = R * (0, 0, -1)
      // With XArbitraryZVertical, world Z = up (gravity).
      double camX = -m.m13;
      double camY = -m.m23;
      double camZ = -m.m33;

      // Camera yaw (azimuth) = angle in the horizontal plane (degrees)
      double cameraYaw = atan2(camX, camY) * 180.0 / M_PI;

      // Camera pitch (elevation) = angle above the horizon (degrees)
      double cameraPitch = asin(fmax(-1.0, fmin(1.0, camZ))) * 180.0 / M_PI;

      // On first sample, capture yaw offset so "front" direction = 0°
      if (!self->_yawOffsetCaptured) {
        self->_yawOffset = cameraYaw;
        self->_yawOffsetCaptured = YES;
      }

      double adjustedYaw = cameraYaw - self->_yawOffset;
      if (adjustedYaw > 180.0) adjustedYaw -= 360.0;
      if (adjustedYaw < -180.0) adjustedYaw += 360.0;

      // Build yaw-offset-adjusted rotation matrix: R' = Rz(+offset) * R
      // This rotates the world frame so "front" at startup aligns with +Y.
      double offsetRad = self->_yawOffset * M_PI / 180.0;
      double co = cos(offsetRad);
      double so = sin(offsetRad);

      double a11 = co * m.m11 - so * m.m21;
      double a12 = co * m.m12 - so * m.m22;
      double a13 = co * m.m13 - so * m.m23;
      double a21 = so * m.m11 + co * m.m21;
      double a22 = so * m.m12 + co * m.m22;
      double a23 = so * m.m13 + co * m.m23;
      double a31 = m.m31;
      double a32 = m.m32;
      double a33 = m.m33;

      [self sendEventWithName:@"onAttitude"
                         body:@{
                           @"yaw":   @(adjustedYaw),
                           @"pitch": @(cameraPitch),
                           @"roll":  @(0.0),
                           @"rotationMatrix": @[
                             @(a11), @(a12), @(a13),
                             @(a21), @(a22), @(a23),
                             @(a31), @(a32), @(a33),
                           ],
                         }];
    }];
  }
}

RCT_EXPORT_METHOD(stopAttitudeUpdates) {
  if (_motionManager && _motionManager.isDeviceMotionActive) {
    [_motionManager stopDeviceMotionUpdates];
  }
}

- (void)dealloc {
  if (_motionManager && _motionManager.isDeviceMotionActive) {
    [_motionManager stopDeviceMotionUpdates];
  }
}

@end
