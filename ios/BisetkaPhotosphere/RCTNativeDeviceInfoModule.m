#import "RCTNativeDeviceInfoModule.h"
#import <UIKit/UIKit.h>
#import <sys/utsname.h>
#import <CoreMotion/CoreMotion.h>

@implementation RCTNativeDeviceInfoModule {
  CMMotionManager *_motionManager;
  NSOperationQueue *_motionQueue;
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
  if (!_motionManager) {
    _motionManager = [[CMMotionManager alloc] init];
  }
  if (!_motionQueue) {
    _motionQueue = [[NSOperationQueue alloc] init];
    _motionQueue.name = @"com.bisetka.motionQueue";
    _motionQueue.maxConcurrentOperationCount = 1;
  }
  if (_motionManager.isDeviceMotionAvailable && !_motionManager.isDeviceMotionActive) {
    _motionManager.deviceMotionUpdateInterval = 1.0 / 30.0; // 30 Hz
    [_motionManager startDeviceMotionUpdatesUsingReferenceFrame:CMAttitudeReferenceFrameXArbitraryZVertical
                                                       toQueue:_motionQueue
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

      // Send RAW yaw (no offset) and raw rotation matrix.
      // JS will handle the yaw offset for the guide-dot coordinate system.
      [self sendEventWithName:@"onAttitude"
                         body:@{
                           @"yaw":   @(cameraYaw),
                           @"pitch": @(cameraPitch),
                           @"roll":  @(0.0),
                           @"rotationMatrix": @[
                             @(m.m11), @(m.m12), @(m.m13),
                             @(m.m21), @(m.m22), @(m.m23),
                             @(m.m31), @(m.m32), @(m.m33),
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
