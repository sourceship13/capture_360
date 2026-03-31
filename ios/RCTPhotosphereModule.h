#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * RCTPhotosphereModule
 *
 * Exposed to JS as 'NativePhotosphere'.
 * Stitches an ordered array of overlapping image paths into a wide
 * panorama JPEG using CoreImage compositing.
 *
 * For production-quality feature-based stitching (SIFT/SURF + homography):
 *   1. Download the OpenCV iOS framework from https://opencv.org/releases/
 *   2. Drag opencv2.framework into Xcode (Embed & Sign).
 *   3. Replace the CoreImage implementation in RCTPhotosphereModule.mm
 *      with an cv::Stitcher-based one (see inline comments in the .mm file).
 */
@interface RCTPhotosphereModule : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END
