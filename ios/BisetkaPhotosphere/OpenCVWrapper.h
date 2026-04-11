//
//  OpenCVWrapper.h
//  BisetkaPhotosphere
//
//  Objective-C wrapper for OpenCV C++ functions
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface OpenCVWrapper : NSObject

/// Warp rectilinear image to equirectangular projection at given yaw/pitch
+ (UIImage *)warpToEquirect:(UIImage *)image
                        yaw:(double)yaw
                      pitch:(double)pitch
                 canvasSize:(CGSize)canvasSize
                 cameraHFOV:(double)hfovDegrees;

/// Feature-matching panorama stitch using OpenCV Stitcher (PANORAMA mode).
/// Returns nil if stitching fails (not enough overlap/features).
+ (nullable UIImage *)stitchPanorama:(NSArray<UIImage *> *)images;

/// Composite multiple frames onto a single equirectangular canvas.
/// rotations: per-frame 9-element arrays [right.xyz, up.xyz, fwd.xyz]
///   representing the camera-to-world rotation with forward = +Z convention.
/// intrinsics: per-frame 6-element arrays [fx, fy, cx, cy, imageWidth, imageHeight]
///   from ARKit camera.intrinsics. Empty array = derive from hFov.
/// Calls progressBlock(frameIndex, totalFrames) after each frame.
+ (UIImage *)compositeEquirect:(NSArray<UIImage *> *)images
                          yaws:(NSArray<NSNumber *> *)yaws
                       pitches:(NSArray<NSNumber *> *)pitches
                          hFov:(double)hfovDegrees
                   canvasWidth:(int)width
                  canvasHeight:(int)height
                     rotations:(NSArray<NSArray<NSNumber *> *> *)rotations
                    intrinsics:(NSArray<NSArray<NSNumber *> *> *)intrinsics
                      progress:(void (^)(NSUInteger current, NSUInteger total))progressBlock;

@end

NS_ASSUME_NONNULL_END
