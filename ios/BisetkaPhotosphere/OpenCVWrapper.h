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

@end

NS_ASSUME_NONNULL_END
