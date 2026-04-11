#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * RCTPhotosphereModule
 *
 * Exposed to JS as 'NativePhotosphere'.
 * Composites captured frames into an equirectangular panorama.
 * Emits 'stitchProgress' events during processing.
 */
@interface RCTPhotosphereModule : RCTEventEmitter <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END
