//
//  RCTModuleProvider.h
//  Capture360
//
//  Helper to manually register React Native modules
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface RCTModuleProvider : NSObject

+ (NSArray<Class> *)extraModulesForBridge;

@end
