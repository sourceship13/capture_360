//
//  RCTModuleProvider.m
//  BisetkaPhotosphere
//

#import "RCTModuleProvider.h"
#import "RCTVideoRecorderModule.h"
#import "RCTNativeDeviceInfoModule.h"

@implementation RCTModuleProvider

+ (NSArray<Class> *)extraModulesForBridge {
    return @[
        [RCTVideoRecorderModule class],
        [RCTNativeDeviceInfoModule class]
    ];
}

@end
