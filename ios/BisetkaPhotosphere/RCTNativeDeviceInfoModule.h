#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <CoreLocation/CoreLocation.h>

@interface RCTNativeDeviceInfoModule : RCTEventEmitter <RCTBridgeModule, CLLocationManagerDelegate>
@end
