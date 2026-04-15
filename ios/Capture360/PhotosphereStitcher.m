#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PhotosphereStitcher, NSObject)

RCT_EXTERN_METHOD(stitchHorizontal:(NSArray<NSString *> *)imageURIs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(composeEquirect:(NSArray<NSDictionary *> *)shots
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
