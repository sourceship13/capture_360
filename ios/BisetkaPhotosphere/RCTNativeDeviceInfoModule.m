#import "RCTNativeDeviceInfoModule.h"
#import <UIKit/UIKit.h>
#import <sys/utsname.h>
#import <CoreMotion/CoreMotion.h>
#import <CoreLocation/CoreLocation.h>

@implementation RCTNativeDeviceInfoModule {
  CMMotionManager *_motionManager;
  CLLocationManager *_locationManager;
  NSOperationQueue *_motionQueue;
  BOOL _hasListeners;
  double _yawOffset;
  BOOL _yawOffsetCaptured;
  double _magneticHeading;  // compass heading from magnetometer
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
  
  // Start magnetometer for true compass heading
  if (!_locationManager) {
    _locationManager = [[CLLocationManager alloc] init];
    _locationManager.delegate = (id<CLLocationManagerDelegate>)self;
    _magneticHeading = 0.0;
    NSLog(@"[RCTNativeDeviceInfoModule] Location manager created");
  }
  
  // Request location permission if needed
  CLAuthorizationStatus status = [CLLocationManager authorizationStatus];
  NSLog(@"[RCTNativeDeviceInfoModule] Location auth status: %d", (int)status);
  if (status == kCLAuthorizationStatusNotDetermined) {
    [_locationManager requestWhenInUseAuthorization];
  }
  
  if ([CLLocationManager headingAvailable]) {
    NSLog(@"[RCTNativeDeviceInfoModule] Heading available, starting updates");
    [_locationManager startUpdatingHeading];
  } else {
    NSLog(@"[RCTNativeDeviceInfoModule] WARNING: Heading NOT available on this device!");
  }
  
  if (_motionManager.isDeviceMotionAvailable && !_motionManager.isDeviceMotionActive) {
    _motionManager.deviceMotionUpdateInterval = 1.0 / 30.0; // 30 Hz
    // Use XTrueNorthZVertical to get compass-referenced yaw (true north = 0°)
    [_motionManager startDeviceMotionUpdatesUsingReferenceFrame:CMAttitudeReferenceFrameXTrueNorthZVertical
                                                       toQueue:_motionQueue
                                                   withHandler:^(CMDeviceMotion *motion, NSError *error) {
      if (!self->_hasListeners || !motion) return;

      // Use rotation matrix to derive camera direction in world space
      CMRotationMatrix m = motion.attitude.rotationMatrix;

      // Get device orientation
      UIDeviceOrientation orientation = [[UIDevice currentDevice] orientation];
      
      // Back camera direction in device frame depends on orientation:
      // Device coords: +X = right, +Y = top of device, +Z = out of screen (toward user)
      // Back camera points AWAY from screen:
      // - Portrait: camera = +Z (out the back, away from screen)
      // - Landscape Right: camera = -X (back points left when home button is right)
      // - Landscape Left: camera = +X (back points right when home button is left) 
      // - Portrait Upside Down: camera = +Z (same as portrait, out the back)
      double camDeviceX = 0.0, camDeviceY = 0.0, camDeviceZ = 1.0; // default: portrait
      
      if (orientation == UIDeviceOrientationLandscapeRight) {
        camDeviceX = -1.0; camDeviceY = 0.0; camDeviceZ = 0.0;
      } else if (orientation == UIDeviceOrientationLandscapeLeft) {
        camDeviceX = 1.0; camDeviceY = 0.0; camDeviceZ = 0.0;
      }
      // Portrait and PortraitUpsideDown both use +Z (out the back)
      
      // Transform camera vector to world frame: camera_world = R * camera_device
      double camX = m.m11 * camDeviceX + m.m12 * camDeviceY + m.m13 * camDeviceZ;  // north
      double camY = m.m21 * camDeviceX + m.m22 * camDeviceY + m.m23 * camDeviceZ;  // east
      double camZ = m.m31 * camDeviceX + m.m32 * camDeviceY + m.m33 * camDeviceZ;  // up

      // Camera pitch (elevation) = angle above the horizon (degrees)
      double cameraPitch = asin(fmax(-1.0, fmin(1.0, camZ))) * 180.0 / M_PI;

      // Camera yaw = use magnetometer heading (true compass bearing)
      // magneticHeading: 0° = north, 90° = east, 180° = south, 270° = west
      // Convert to [-180, +180] range: 0° = north, +90° = east, ±180° = south, -90° = west
      double cameraYaw = self->_magneticHeading;
      if (cameraYaw > 180.0) {
        cameraYaw -= 360.0;
      }
      
      // DEBUG: log camera vector every 30 frames (~1 sec)
      static int frameCount = 0;
      if (frameCount++ % 30 == 0) {
        NSLog(@"[Attitude] orientation=%ld camDevice=(%.2f,%.2f,%.2f) camWorld=(%.2f,%.2f,%.2f) → yaw=%.1f° pitch=%.1f°",
              (long)orientation,
              camDeviceX, camDeviceY, camDeviceZ,
              camX, camY, camZ,
              cameraYaw, cameraPitch);
      }

      // Send RAW yaw (compass heading) and raw rotation matrix
      // JS will handle the yaw offset for the guide-dot coordinate system
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
  if (_locationManager) {
    [_locationManager stopUpdatingHeading];
  }
}

// CLLocationManagerDelegate - receive compass heading updates
- (void)locationManager:(CLLocationManager *)manager didUpdateHeading:(CLHeading *)newHeading {
  // magneticHeading: 0° = north, 90° = east, 180° = south, 270° = west
  _magneticHeading = newHeading.magneticHeading;
  NSLog(@"[RCTNativeDeviceInfoModule] Heading update: %.1f°", _magneticHeading);
}

- (void)locationManager:(CLLocationManager *)manager didChangeAuthorizationStatus:(CLAuthorizationStatus)status {
  NSLog(@"[RCTNativeDeviceInfoModule] Auth status changed to: %d", (int)status);
  if (status == kCLAuthorizationStatusAuthorizedWhenInUse || status == kCLAuthorizationStatusAuthorizedAlways) {
    if ([CLLocationManager headingAvailable]) {
      [_locationManager startUpdatingHeading];
    }
  }
}

- (void)dealloc {
  if (_motionManager && _motionManager.isDeviceMotionActive) {
    [_motionManager stopDeviceMotionUpdates];
  }
  if (_locationManager) {
    [_locationManager stopUpdatingHeading];
  }
}

@end
