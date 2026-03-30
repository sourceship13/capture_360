#import "RCTNativeDeviceInfoModule.h"
#import <UIKit/UIKit.h>
#import <sys/utsname.h>

@implementation RCTNativeDeviceInfoModule

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
  return @[@"onDeviceEvent"];
}

@end
