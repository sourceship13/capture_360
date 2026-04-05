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

@end

NS_ASSUME_NONNULL_END
