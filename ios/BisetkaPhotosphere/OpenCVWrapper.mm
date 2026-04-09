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
#import <opencv2/stitching.hpp>

using namespace cv;

@implementation OpenCVWrapper

+ (UIImage *)warpToEquirect:(UIImage *)image
                        yaw:(double)yawDeg
                      pitch:(double)pitchDeg
                 canvasSize:(CGSize)canvasSize
                 cameraHFOV:(double)hfovDegrees {
    
    // Convert UIImage to cv::Mat
    Mat src = [self cvMatFromUIImage:image];
    // CGContextDrawImage has origin at bottom-left (CG convention).
    // Flip vertically so row 0 = top of image (OpenCV convention).
    cv::flip(src, src, 0);
    
    int width = (int)canvasSize.width;
    int height = (int)canvasSize.height;
    Mat dst = Mat::zeros(height, width, CV_8UC4);
    
    double imgW = src.cols;
    double imgH = src.rows;
    double hfovRad = hfovDegrees * M_PI / 180.0;
    // Correct vFov from aspect ratio: tan(vfov/2) = tan(hfov/2) * imgH/imgW
    double vfovRad = 2.0 * atan(tan(hfovRad / 2.0) * (imgH / imgW));
    
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
            
            // Spherical → 3D unit vector (world space)
            // Standard equirect: lon=0 → +Z forward
            // (The SphereViewer handles the sign flip in its shader via
            //  atan(r.x, -r.z), so we use the standard convention here.)
            double x = cos(lat) * sin(lon);
            double y = sin(lat);
            double z = cos(lat) * cos(lon);
            
            // Inverse camera rotation: world → camera local frame
            // Camera convention (from ARKit):
            //   yaw = atan2(forward.x, forward.z)   → positive = look right
            //   pitch = asin(-forward.y)             → positive = look down
            // R_cam_to_world = R_yaw(Y) * R_pitch(X)
            // R_world_to_cam = R_pitch^T * R_yaw^T

            // Step 1: Undo yaw (rotate around Y by -yaw)
            double x1 =  x * cosYaw - z * sinYaw;
            double y1 =  y;
            double z1 =  x * sinYaw + z * cosYaw;

            // Step 2: Undo pitch (rotate around X by -pitch)
            double xc =  x1;
            double yc =  y1 * cosPitch + z1 * sinPitch;
            double zc = -y1 * sinPitch + z1 * cosPitch;
            
            // Project to camera image plane (pinhole)
            if (zc <= 0) continue;
            
            double u =  fx * (xc / zc) + cx;
            double v = -fy * (yc / zc) + cy;  // negate: camera Y up → image v down
            
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

// ---------------------------------------------------------------------------
// stitchPanorama — Feature-matching panorama stitch via cv::Stitcher.
//
// Images are scaled down to max 800px for speed, then stitched using
// OpenCV PANORAMA mode (spherical warping + multi-band blending).
// Returns nil if stitching fails.
// ---------------------------------------------------------------------------
+ (UIImage *)stitchPanorama:(NSArray<UIImage *> *)images {
    if (images.count < 2) {
        NSLog(@"[OpenCV Stitcher] Need at least 2 images, got %lu",
              (unsigned long)images.count);
        return nil;
    }

    std::vector<Mat> mats;
    mats.reserve(images.count);

    for (UIImage *img in images) {
        Mat m = [self cvMatFromUIImage:img];
        cv::flip(m, m, 0);  // fix CG bottom-left origin

        // Convert RGBA → BGR (OpenCV stitcher expects BGR)
        Mat bgr;
        cvtColor(m, bgr, COLOR_RGBA2BGR);

        // Scale down for performance (max 1200px on longest side)
        double maxDim = MAX(bgr.cols, bgr.rows);
        if (maxDim > 1200) {
            double scale = 1200.0 / maxDim;
            Mat scaled;
            cv::resize(bgr, scaled, cv::Size(), scale, scale, cv::INTER_AREA);
            mats.push_back(scaled);
        } else {
            mats.push_back(bgr);
        }
    }

    NSLog(@"[OpenCV Stitcher] Attempting stitch of %lu images (scaled to ~1200px)",
          (unsigned long)mats.size());

    cv::Ptr<cv::Stitcher> stitcher = cv::Stitcher::create(cv::Stitcher::PANORAMA);
    Mat result;
    cv::Stitcher::Status status = stitcher->stitch(mats, result);

    if (status != cv::Stitcher::OK) {
        NSString *reason;
        switch (status) {
            case cv::Stitcher::ERR_NEED_MORE_IMGS:
                reason = @"need more images";
                break;
            case cv::Stitcher::ERR_HOMOGRAPHY_EST_FAIL:
                reason = @"homography estimation failed";
                break;
            case cv::Stitcher::ERR_CAMERA_PARAMS_ADJUST_FAIL:
                reason = @"camera params adjustment failed";
                break;
            default:
                reason = [NSString stringWithFormat:@"unknown (%d)", (int)status];
        }
        NSLog(@"[OpenCV Stitcher] FAILED: %@", reason);
        return nil;
    }

    NSLog(@"[OpenCV Stitcher] SUCCESS: %dx%d", result.cols, result.rows);

    // Convert BGR → RGBA for UIImage
    Mat rgba;
    cvtColor(result, rgba, COLOR_BGR2RGBA);

    return [self UIImageFromCVMat:rgba];
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
