//
//  OpenCVWrapper.mm
//  BisetkaPhotosphere
//
//  Objective-C++ implementation using OpenCV
//

#import "OpenCVWrapper.h"

#ifdef __cplusplus
#undef NO
#undef YES
#endif

#import <opencv2/opencv.hpp>

using namespace cv;

@implementation OpenCVWrapper

+ (UIImage *)warpToEquirect:(UIImage *)image
                        yaw:(double)yawDeg
                      pitch:(double)pitchDeg
                 canvasSize:(CGSize)canvasSize
                 cameraHFOV:(double)hfovDegrees {
    
    // Convert UIImage to cv::Mat
    Mat src = [self cvMatFromUIImage:image];
    
    int width = (int)canvasSize.width;
    int height = (int)canvasSize.height;
    Mat dst = Mat::zeros(height, width, CV_8UC4);
    
    double imgW = src.cols;
    double imgH = src.rows;
    double hfovRad = hfovDegrees * M_PI / 180.0;
    double vfovRad = hfovRad * (imgH / imgW);
    
    // Camera intrinsics (pinhole model)
    double fx = imgW / (2.0 * tan(hfovRad / 2.0));
    double fy = imgH / (2.0 * tan(vfovRad / 2.0));
    double cx = imgW / 2.0;
    double cy = imgH / 2.0;
    
    double yawRad = yawDeg * M_PI / 180.0;
    double pitchRad = pitchDeg * M_PI / 180.0;
    
    double cosYaw = cos(yawRad);
    double sinYaw = sin(yawRad);
    double cosPitch = cos(pitchRad);
    double sinPitch = sin(pitchRad);
    
    // For each pixel in equirect canvas
    for (int canvasY = 0; canvasY < height; canvasY++) {
        for (int canvasX = 0; canvasX < width; canvasX++) {
            // Equirect → spherical coordinates
            double lon = ((double)canvasX / width) * 2.0 * M_PI - M_PI;  // -π to +π
            double lat = M_PI / 2.0 - ((double)canvasY / height) * M_PI;  // π/2 to -π/2
            
            // Spherical → 3D unit vector
            double x = cos(lat) * sin(lon);
            double y = sin(lat);
            double z = cos(lat) * cos(lon);
            
            // Rotate by camera orientation (pitch then yaw)
            double x2 = x * cosPitch - y * sinPitch;
            double y2 = x * sinPitch + y * cosPitch;
            double z2 = z;
            
            double x3 = x2 * cosYaw - z2 * sinYaw;
            double z3 = x2 * sinYaw + z2 * cosYaw;
            
            // Project to camera plane (skip if behind camera)
            if (z3 <= 0) continue;
            
            double u = fx * (x3 / z3) + cx;
            double v = fy * (y2 / z3) + cy;
            
            // Bounds check + bilinear interpolation
            if (u >= 0 && u < imgW - 1 && v >= 0 && v < imgH - 1) {
                int u0 = (int)u;
                int v0 = (int)v;
                double du = u - u0;
                double dv = v - v0;
                
                Vec4b p00 = src.at<Vec4b>(v0, u0);
                Vec4b p01 = src.at<Vec4b>(v0, u0 + 1);
                Vec4b p10 = src.at<Vec4b>(v0 + 1, u0);
                Vec4b p11 = src.at<Vec4b>(v0 + 1, u0 + 1);
                
                for (int c = 0; c < 4; c++) {
                    double val = (1 - du) * (1 - dv) * p00[c]
                               + du * (1 - dv) * p01[c]
                               + (1 - du) * dv * p10[c]
                               + du * dv * p11[c];
                    dst.at<Vec4b>(canvasY, canvasX)[c] = (uchar)val;
                }
            }
        }
    }
    
    return [self UIImageFromCVMat:dst];
}

#pragma mark - UIImage <-> cv::Mat conversion

+ (Mat)cvMatFromUIImage:(UIImage *)image {
    CGColorSpaceRef colorSpace = CGImageGetColorSpace(image.CGImage);
    CGFloat cols = image.size.width;
    CGFloat rows = image.size.height;
    
    Mat cvMat(rows, cols, CV_8UC4);
    
    CGContextRef context = CGBitmapContextCreate(cvMat.data,
                                                 cols,
                                                 rows,
                                                 8,
                                                 cvMat.step[0],
                                                 colorSpace,
                                                 kCGImageAlphaPremultipliedLast | kCGBitmapByteOrderDefault);
    
    CGContextDrawImage(context, CGRectMake(0, 0, cols, rows), image.CGImage);
    CGContextRelease(context);
    
    return cvMat;
}

+ (UIImage *)UIImageFromCVMat:(Mat)cvMat {
    NSData *data = [NSData dataWithBytes:cvMat.data length:cvMat.elemSize() * cvMat.total()];
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)data);
    CGImageRef imageRef = CGImageCreate(cvMat.cols,
                                        cvMat.rows,
                                        8,
                                        32,
                                        cvMat.step[0],
                                        colorSpace,
                                        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrderDefault,
                                        provider,
                                        NULL,
                                        false,
                                        kCGRenderingIntentDefault);
    
    UIImage *finalImage = [UIImage imageWithCGImage:imageRef];
    CGImageRelease(imageRef);
    CGDataProviderRelease(provider);
    CGColorSpaceRelease(colorSpace);
    
    return finalImage;
}

@end
