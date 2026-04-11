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

// ---------------------------------------------------------------------------
// compositeEquirect — Uses OpenCV Stitcher pipeline for proper alignment,
// then reprojects the spherical result to equirectangular format.
//
// The key insight: ARKit rotation matrices have ~1° error which causes
// 10-20px misalignment on a 4096px canvas. Only feature-based bundle
// adjustment can fix this. cv::Stitcher handles:
//   - ORB/SIFT feature detection + matching
//   - Bundle adjustment (corrects camera rotations)
//   - Exposure compensation
//   - Seam finding (graph cut)
//   - Multi-band blending
// ---------------------------------------------------------------------------
+ (UIImage *)compositeEquirect:(NSArray<UIImage *> *)images
                          yaws:(NSArray<NSNumber *> *)yaws
                       pitches:(NSArray<NSNumber *> *)pitches
                          hFov:(double)hfovDegrees
                   canvasWidth:(int)width
                  canvasHeight:(int)height
                     rotations:(NSArray<NSArray<NSNumber *> *> *)rotations
                      progress:(void (^)(NSUInteger, NSUInteger))progressBlock {

    if (images.count < 2) return nil;

    // ── Angular deduplication ────────────────────────────────────────
    const double MIN_ANGLE_DEG = 25.0;
    const double MIN_ANGLE_COS = cos(MIN_ANGLE_DEG * M_PI / 180.0);

    NSUInteger N = images.count;
    std::vector<double> fwdX(N), fwdY(N), fwdZ(N);
    for (NSUInteger i = 0; i < N; i++) {
        NSArray<NSNumber *> *rot = (i < rotations.count) ? rotations[i] : nil;
        if (rot && rot.count == 9) {
            fwdX[i] = [rot[6] doubleValue];
            fwdY[i] = [rot[7] doubleValue];
            fwdZ[i] = [rot[8] doubleValue];
        } else {
            double yR = [yaws[i] doubleValue] * M_PI / 180.0;
            double pR = [pitches[i] doubleValue] * M_PI / 180.0;
            fwdX[i] = sin(yR) * cos(pR);
            fwdY[i] = -sin(pR);
            fwdZ[i] = cos(yR) * cos(pR);
        }
    }

    std::vector<NSUInteger> keepIdx;
    keepIdx.reserve(N);
    for (NSUInteger i = 0; i < N; i++) {
        bool tooClose = false;
        for (NSUInteger ki : keepIdx) {
            double dot = fwdX[i]*fwdX[ki] + fwdY[i]*fwdY[ki] + fwdZ[i]*fwdZ[ki];
            if (dot > MIN_ANGLE_COS) { tooClose = true; break; }
        }
        if (!tooClose) keepIdx.push_back(i);
    }
    NSLog(@"[Equirect] Angular dedup: %lu → %lu frames (min %.0f°)",
          (unsigned long)N, (unsigned long)keepIdx.size(), MIN_ANGLE_DEG);

    // ── Prepare images for stitcher ──────────────────────────────────
    std::vector<Mat> mats;
    mats.reserve(keepIdx.size());

    for (NSUInteger ki = 0; ki < keepIdx.size(); ki++) {
        NSUInteger i = keepIdx[ki];
        Mat m = [self cvMatFromUIImage:images[i]];
        cv::flip(m, m, 0);

        // Convert RGBA → BGR (Stitcher expects BGR)
        Mat bgr;
        cvtColor(m, bgr, COLOR_RGBA2BGR);

        // Scale for performance — but keep resolution higher for quality
        double maxDim = MAX(bgr.cols, bgr.rows);
        if (maxDim > 1600) {
            double scale = 1600.0 / maxDim;
            Mat scaled;
            cv::resize(bgr, scaled, cv::Size(), scale, scale, cv::INTER_AREA);
            mats.push_back(scaled);
        } else {
            mats.push_back(bgr);
        }

        if (progressBlock) {
            progressBlock(ki + 1, keepIdx.size());
        }
    }

    NSLog(@"[Equirect] Running OpenCV Stitcher on %lu frames...", (unsigned long)mats.size());

    // ── Run the stitcher ─────────────────────────────────────────────
    cv::Ptr<cv::Stitcher> stitcher = cv::Stitcher::create(cv::Stitcher::PANORAMA);
    stitcher->setPanoConfidenceThresh(0.3);
    // Tune for photosphere use:
    // - Lower confidence threshold for matching (we have lots of overlap)
    // - Use PANORAMA mode (spherical warping)


    Mat stitchedResult;
    cv::Stitcher::Status status = stitcher->stitch(mats, stitchedResult);

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
        NSLog(@"[Equirect Stitcher] FAILED: %@ — falling back to IMU composite", reason);

        // ── Fallback: simple IMU-based compositing ───────────────────
        return [self compositeEquirectFallback:images
                                         yaws:yaws
                                      pitches:pitches
                                         hFov:hfovDegrees
                                  canvasWidth:width
                                 canvasHeight:height
                                    rotations:rotations
                                     progress:progressBlock];
    }

    NSLog(@"[Equirect Stitcher] SUCCESS: %dx%d", stitchedResult.cols, stitchedResult.rows);

    // ── Resize to target equirect dimensions ─────────────────────────
    // The stitcher output is already in spherical projection.
    // Resize to our target canvas size.
    Mat resized;
    cv::resize(stitchedResult, resized, cv::Size(width, height), 0, 0, cv::INTER_LANCZOS4);

    // Convert BGR → RGBA
    Mat rgba;
    cvtColor(resized, rgba, COLOR_BGR2RGBA);

    NSLog(@"[Equirect Composite] Done via Stitcher: %dx%d", width, height);
    return [self UIImageFromCVMat:rgba];
}

// ---------------------------------------------------------------------------
// compositeEquirectFallback — IMU-based compositing with pairwise rotation
// refinement. For each pair of overlapping frames, ORB features are matched
// in the original camera images and a corrective rotation is computed from
// the homography. This fixes the ~1° ARKit rotation errors that cause
// visible steps at straight lines (ceilings, walls).
// ---------------------------------------------------------------------------
+ (UIImage *)compositeEquirectFallback:(NSArray<UIImage *> *)images
                                  yaws:(NSArray<NSNumber *> *)yaws
                               pitches:(NSArray<NSNumber *> *)pitches
                                  hFov:(double)hfovDegrees
                           canvasWidth:(int)width
                          canvasHeight:(int)height
                             rotations:(NSArray<NSArray<NSNumber *> *> *)rotations
                              progress:(void (^)(NSUInteger, NSUInteger))progressBlock {

    double hfovRad = hfovDegrees * M_PI / 180.0;

    // ── Angular dedup ────────────────────────────────────────────────
    const double MIN_ANGLE_DEG = 25.0;
    const double MIN_ANGLE_COS = cos(MIN_ANGLE_DEG * M_PI / 180.0);
    NSUInteger N = images.count;
    std::vector<double> fwdX(N), fwdY(N), fwdZ(N);
    for (NSUInteger i = 0; i < N; i++) {
        NSArray<NSNumber *> *rot = (i < rotations.count) ? rotations[i] : nil;
        if (rot && rot.count == 9) {
            fwdX[i] = [rot[6] doubleValue];
            fwdY[i] = [rot[7] doubleValue];
            fwdZ[i] = [rot[8] doubleValue];
        } else {
            double yR = [yaws[i] doubleValue] * M_PI / 180.0;
            double pR = [pitches[i] doubleValue] * M_PI / 180.0;
            fwdX[i] = sin(yR) * cos(pR);
            fwdY[i] = -sin(pR);
            fwdZ[i] = cos(yR) * cos(pR);
        }
    }
    std::vector<NSUInteger> keepIdx;
    keepIdx.reserve(N);
    for (NSUInteger i = 0; i < N; i++) {
        bool tooClose = false;
        for (NSUInteger ki : keepIdx) {
            double dot = fwdX[i]*fwdX[ki] + fwdY[i]*fwdY[ki] + fwdZ[i]*fwdZ[ki];
            if (dot > MIN_ANGLE_COS) { tooClose = true; break; }
        }
        if (!tooClose) keepIdx.push_back(i);
    }
    NSUInteger numFrames = keepIdx.size();
    NSLog(@"[Equirect Fallback] %lu frames after dedup", (unsigned long)numFrames);

    // ══════════════════════════════════════════════════════════════════
    // STEP 0: Load all source images and extract rotation matrices
    // ══════════════════════════════════════════════════════════════════
    struct FrameData {
        Mat src;         // original camera image (BGR, scaled)
        double R[9];     // camera-to-world rotation: [Rx,Ry,Rz, Ux,Uy,Uz, Fx,Fy,Fz]
        double fx, fy, cx, cy;
        double imgW, imgH;
    };
    std::vector<FrameData> frames(numFrames);

    for (NSUInteger ki = 0; ki < numFrames; ki++) {
        NSUInteger i = keepIdx[ki];
        FrameData &fd = frames[ki];

        Mat src = [self cvMatFromUIImage:images[i]];
        cv::flip(src, src, 0);

        double maxDim = MAX(src.cols, src.rows);
        if (maxDim > 2400) {
            double s = 2400.0 / maxDim;
            Mat scaled;
            cv::resize(src, scaled, cv::Size(), s, s, cv::INTER_AREA);
            src = scaled;
        }

        // Convert to BGR for feature detection
        Mat bgr;
        cvtColor(src, bgr, COLOR_RGBA2BGR);
        fd.src = bgr;

        fd.imgW = src.cols;
        fd.imgH = src.rows;
        double vfovRad = 2.0 * atan(tan(hfovRad / 2.0) * (fd.imgH / fd.imgW));
        fd.fx = fd.imgW / (2.0 * tan(hfovRad / 2.0));
        fd.fy = fd.imgH / (2.0 * tan(vfovRad / 2.0));
        fd.cx = fd.imgW / 2.0;
        fd.cy = fd.imgH / 2.0;

        // Extract rotation
        NSArray<NSNumber *> *rot = (i < rotations.count) ? rotations[i] : nil;
        if (rot && rot.count == 9) {
            for (int j = 0; j < 9; j++) fd.R[j] = [rot[j] doubleValue];
        } else {
            double yawRad = [yaws[i] doubleValue] * M_PI / 180.0;
            double pitchRad = [pitches[i] doubleValue] * M_PI / 180.0;
            double cY = cos(yawRad), sY = sin(yawRad);
            double cP = cos(pitchRad), sP = sin(pitchRad);
            fd.R[0] = cY;    fd.R[1] = 0;   fd.R[2] = -sY;    // right
            fd.R[3] = sY*sP; fd.R[4] = cP;  fd.R[5] = cY*sP;  // up
            fd.R[6] = sY*cP; fd.R[7] = -sP; fd.R[8] = cY*cP;  // forward
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 1: Pairwise rotation refinement
    //
    // For each pair of frames with overlapping FOV, match ORB features
    // and compute a homography. For pure-rotation cameras:
    //   H = K2 * R_2to1 * K1^-1
    // We extract R_2to1 and compare with the IMU-predicted relative
    // rotation. The difference is applied as a correction.
    //
    // Frame 0 is the anchor. Each subsequent frame's rotation is
    // refined relative to its best-overlapping already-refined frame.
    // ══════════════════════════════════════════════════════════════════

    auto orb = cv::ORB::create(1000);
    cv::BFMatcher matcher(cv::NORM_HAMMING);

    // Pre-detect features for all frames
    std::vector<std::vector<cv::KeyPoint>> allKps(numFrames);
    std::vector<Mat> allDescs(numFrames);
    for (NSUInteger ki = 0; ki < numFrames; ki++) {
        Mat gray;
        cvtColor(frames[ki].src, gray, COLOR_BGR2GRAY);
        orb->detectAndCompute(gray, cv::noArray(), allKps[ki], allDescs[ki]);
    }

    std::vector<bool> refined(numFrames, false);
    refined[0] = true;  // Frame 0 is anchor

    for (NSUInteger ki = 1; ki < numFrames; ki++) {
        // Find best overlapping refined frame
        int bestRef = -1;
        double bestDot = -1;
        for (NSUInteger rki = 0; rki < ki; rki++) {
            if (!refined[rki]) continue;
            // Dot product of forward vectors
            double dot = frames[ki].R[6]*frames[rki].R[6]
                       + frames[ki].R[7]*frames[rki].R[7]
                       + frames[ki].R[8]*frames[rki].R[8];
            if (dot > bestDot) { bestDot = dot; bestRef = (int)rki; }
        }

        if (bestRef < 0 || bestDot < 0.3) {
            refined[ki] = true;  // No good overlap, keep IMU rotation
            continue;
        }

        // Match features
        if (allDescs[ki].empty() || allDescs[bestRef].empty()) {
            refined[ki] = true;
            continue;
        }

        std::vector<std::vector<cv::DMatch>> knnMatches;
        matcher.knnMatch(allDescs[bestRef], allDescs[ki], knnMatches, 2);

        // Lowe's ratio test
        std::vector<cv::Point2f> ptsA, ptsB;
        for (auto &m : knnMatches) {
            if (m.size() == 2 && m[0].distance < 0.7f * m[1].distance) {
                ptsA.push_back(allKps[bestRef][m[0].queryIdx].pt);
                ptsB.push_back(allKps[ki][m[0].trainIdx].pt);
            }
        }

        if (ptsA.size() < 12) {
            refined[ki] = true;
            NSLog(@"[RotRefine] Frame %lu: only %lu matches, keeping IMU", (unsigned long)ki, (unsigned long)ptsA.size());
            continue;
        }

        // Compute homography
        Mat inlierMask;
        Mat H = findHomography(ptsA, ptsB, cv::RANSAC, 3.0, inlierMask);
        if (H.empty()) {
            refined[ki] = true;
            continue;
        }

        int inlierCount = countNonZero(inlierMask);
        if (inlierCount < 10) {
            refined[ki] = true;
            NSLog(@"[RotRefine] Frame %lu: only %d inliers, keeping IMU", (unsigned long)ki, inlierCount);
            continue;
        }

        // Extract rotation from H = K_B * R_AtoB * K_A^-1
        // R_AtoB = K_B^-1 * H * K_A
        FrameData &fA = frames[bestRef];
        FrameData &fB = frames[ki];

        Mat K_A = (Mat_<double>(3,3) << fA.fx, 0, fA.cx, 0, fA.fy, fA.cy, 0, 0, 1);
        Mat K_B = (Mat_<double>(3,3) << fB.fx, 0, fB.cx, 0, fB.fy, fB.cy, 0, 0, 1);

        Mat H64;
        H.convertTo(H64, CV_64F);
        Mat R_AtoB = K_B.inv() * H64 * K_A;

        // Normalize to proper rotation (closest rotation matrix via SVD)
        Mat W, U, Vt;
        cv::SVDecomp(R_AtoB, W, U, Vt);
        Mat R_clean = U * Vt;
        double det = determinant(R_clean);
        if (det < 0) {
            R_clean = -R_clean;
        }

        // R_AtoB transforms points from A's camera space to B's camera space
        // In world coordinates:
        //   R_B_world = R_A_world * R_AtoB^T
        // (because R_AtoB goes from A→B in camera space,
        //  and our R matrices are camera-to-world)

        // Build R_A as 3x3 Mat (camera-to-world, rows = right/up/forward)
        Mat R_A_w = (Mat_<double>(3,3) <<
            fA.R[0], fA.R[1], fA.R[2],
            fA.R[3], fA.R[4], fA.R[5],
            fA.R[6], fA.R[7], fA.R[8]);

        // Corrected world rotation for frame B
        Mat R_B_corrected = R_A_w * R_clean.t();

        // Extract back to our format
        fB.R[0] = R_B_corrected.at<double>(0,0);
        fB.R[1] = R_B_corrected.at<double>(0,1);
        fB.R[2] = R_B_corrected.at<double>(0,2);
        fB.R[3] = R_B_corrected.at<double>(1,0);
        fB.R[4] = R_B_corrected.at<double>(1,1);
        fB.R[5] = R_B_corrected.at<double>(1,2);
        fB.R[6] = R_B_corrected.at<double>(2,0);
        fB.R[7] = R_B_corrected.at<double>(2,1);
        fB.R[8] = R_B_corrected.at<double>(2,2);

        refined[ki] = true;
        NSLog(@"[RotRefine] Frame %lu refined from %d (%d inliers, %.1f° overlap)",
              (unsigned long)ki, bestRef, inlierCount, acos(fmin(1.0, bestDot))*180/M_PI);
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 2: Warp each frame with corrected rotations
    // ══════════════════════════════════════════════════════════════════
    int height_ = height, width_ = width;
    std::vector<Mat> warpedFrames(numFrames);
    std::vector<Mat> warpedMasks(numFrames);
    std::vector<Mat> warpedWeights(numFrames);

    for (NSUInteger ki = 0; ki < numFrames; ki++) {
        warpedFrames[ki]  = Mat::zeros(height_, width_, CV_8UC3);
        warpedMasks[ki]   = Mat::zeros(height_, width_, CV_8UC1);
        warpedWeights[ki] = Mat::zeros(height_, width_, CV_32FC1);

        FrameData &fd = frames[ki];
        // Use the RGBA source (not BGR) for warping
        NSUInteger i = keepIdx[ki];
        Mat src = [self cvMatFromUIImage:images[i]];
        cv::flip(src, src, 0);
        double maxDim = MAX(src.cols, src.rows);
        if (maxDim > 2400) {
            double s = 2400.0 / maxDim;
            Mat scaled;
            cv::resize(src, scaled, cv::Size(), s, s, cv::INTER_AREA);
            src = scaled;
        }

        double Rx = fd.R[0], Ry = fd.R[1], Rz = fd.R[2];
        double Ux = fd.R[3], Uy = fd.R[4], Uz = fd.R[5];
        double Fx = fd.R[6], Fy = fd.R[7], Fz = fd.R[8];

        // Bounding box
        double lonCenter = atan2(Fx, -Fz);
        double latCenter = asin(fmax(-1, fmin(1, Fy)));
        double vfovRad = 2.0 * atan(tan(hfovRad / 2.0) * (fd.imgH / fd.imgW));
        double halfH = hfovDegrees / 2.0 + 10.0;
        double halfV = (vfovRad * 180.0 / M_PI) / 2.0 + 10.0;
        int cxMin = (int)(((lonCenter - halfH*M_PI/180.0)/M_PI + 1.0)*0.5*width_) - 2;
        int cxMax = (int)(((lonCenter + halfH*M_PI/180.0)/M_PI + 1.0)*0.5*width_) + 2;
        int cyMin = (int)((0.5 - (latCenter + halfV*M_PI/180.0)/M_PI)*height_) - 2;
        int cyMax = (int)((0.5 - (latCenter - halfV*M_PI/180.0)/M_PI)*height_) + 2;
        bool wraps = (cxMin < 0 || cxMax >= width_);
        if (!wraps) { cxMin = MAX(0, cxMin); cxMax = MIN(width_-1, cxMax); }
        cyMin = MAX(0, cyMin); cyMax = MIN(height_-1, cyMax);

        for (int canvasY = cyMin; canvasY <= cyMax; canvasY++) {
            for (int rawX = cxMin; rawX <= cxMax; rawX++) {
                int canvasX = rawX;
                if (canvasX < 0) canvasX += width_;
                if (canvasX >= width_) canvasX -= width_;

                double lon = ((double)canvasX / width_) * 2.0 * M_PI - M_PI;
                double lat = M_PI / 2.0 - ((double)canvasY / height_) * M_PI;
                double cosLat = cos(lat);
                double dx = cosLat*sin(lon), dy = sin(lat), dz = -cosLat*cos(lon);

                double xc = Rx*dx + Ry*dy + Rz*dz;
                double yc = Ux*dx + Uy*dy + Uz*dz;
                double zc = Fx*dx + Fy*dy + Fz*dz;
                if (zc <= 0) continue;

                double u = fd.fx*(xc/zc) + fd.cx;
                double v = -fd.fy*(yc/zc) + fd.cy;
                if (u < 0 || u >= fd.imgW-1 || v < 0 || v >= fd.imgH-1) continue;

                int u0=(int)u, v0=(int)v;
                double du=u-u0, dv=v-v0;
                Vec4b p00=src.at<Vec4b>(v0,u0), p01=src.at<Vec4b>(v0,u0+1);
                Vec4b p10=src.at<Vec4b>(v0+1,u0), p11=src.at<Vec4b>(v0+1,u0+1);
                for (int c=0; c<3; c++) {
                    double val = (1-du)*(1-dv)*p00[c] + du*(1-dv)*p01[c]
                               + (1-du)*dv*p10[c] + du*dv*p11[c];
                    warpedFrames[ki].at<Vec3b>(canvasY, canvasX)[c] = (uchar)MIN(val, 255.0);
                }
                warpedMasks[ki].at<uchar>(canvasY, canvasX) = 255;
                double edgeDist = MIN(MIN(u, fd.imgW-1-u), MIN(v, fd.imgH-1-v));
                warpedWeights[ki].at<float>(canvasY, canvasX) = (float)edgeDist;
            }
        }
        if (progressBlock) progressBlock(ki+1, numFrames);
        NSLog(@"[Equirect Fallback] Warped frame %lu/%lu", (unsigned long)(ki+1), (unsigned long)numFrames);
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 3: Per-channel exposure compensation
    // ══════════════════════════════════════════════════════════════════
    std::vector<Vec3d> channelMeans(numFrames);
    Vec3d globalChannelMean(0,0,0);
    int globalCount = 0;
    for (NSUInteger ki = 0; ki < numFrames; ki++) {
        Vec3d sum(0,0,0); int count = 0;
        for (int r=0; r<height_; r++)
            for (int c=0; c<width_; c++)
                if (warpedWeights[ki].at<float>(r,c) > 0) {
                    Vec3b px = warpedFrames[ki].at<Vec3b>(r,c);
                    sum[0]+=px[0]; sum[1]+=px[1]; sum[2]+=px[2]; count++;
                }
        channelMeans[ki] = (count>0) ? sum/count : Vec3d(128,128,128);
        globalChannelMean += sum; globalCount += count;
    }
    globalChannelMean /= MAX(globalCount, 1);
    for (NSUInteger ki = 0; ki < numFrames; ki++) {
        Vec3d sc;
        for (int ch=0; ch<3; ch++) {
            sc[ch] = (channelMeans[ki][ch]>1) ? globalChannelMean[ch]/channelMeans[ki][ch] : 1.0;
            sc[ch] = fmax(0.6, fmin(1.6, sc[ch]));
        }
        for (int r=0; r<height_; r++)
            for (int c=0; c<width_; c++)
                if (warpedWeights[ki].at<float>(r,c) > 0) {
                    Vec3b &px = warpedFrames[ki].at<Vec3b>(r,c);
                    px[0]=(uchar)MIN(px[0]*sc[0],255.0);
                    px[1]=(uchar)MIN(px[1]*sc[1],255.0);
                    px[2]=(uchar)MIN(px[2]*sc[2],255.0);
                }
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 4: Winner-takes-all + Gaussian feather
    // ══════════════════════════════════════════════════════════════════
    Mat bestIdx = Mat::ones(height_, width_, CV_32SC1) * -1;
    Mat bestDist = Mat::zeros(height_, width_, CV_32FC1);
    for (NSUInteger ki = 0; ki < numFrames; ki++)
        for (int r=0; r<height_; r++) {
            const float *wRow = warpedWeights[ki].ptr<float>(r);
            float *bdRow = bestDist.ptr<float>(r);
            int *biRow = bestIdx.ptr<int>(r);
            for (int c=0; c<width_; c++)
                if (wRow[c] > bdRow[c]) { bdRow[c]=wRow[c]; biRow[c]=(int)ki; }
        }

    for (NSUInteger ki = 0; ki < numFrames; ki++)
        for (int r=0; r<height_; r++) {
            uchar *maskRow = warpedMasks[ki].ptr<uchar>(r);
            const int *biRow = bestIdx.ptr<int>(r);
            for (int c=0; c<width_; c++)
                maskRow[c] = (biRow[c]==(int)ki) ? 255 : 0;
        }

    std::vector<Mat> floatMasks(numFrames);
    for (NSUInteger ki = 0; ki < numFrames; ki++) {
        warpedMasks[ki].convertTo(floatMasks[ki], CV_32FC1, 1.0/255.0);
        cv::GaussianBlur(floatMasks[ki], floatMasks[ki], cv::Size(17, 17), 0);
    }

    Mat result(height_, width_, CV_8UC4);
    for (int r=0; r<height_; r++)
        for (int c=0; c<width_; c++) {
            float totalW=0; float accR=0, accG=0, accB=0;
            for (NSUInteger ki=0; ki<numFrames; ki++) {
                float w = floatMasks[ki].at<float>(r,c);
                if (w > 0.001f) {
                    Vec3b px = warpedFrames[ki].at<Vec3b>(r,c);
                    accR+=px[0]*w; accG+=px[1]*w; accB+=px[2]*w; totalW+=w;
                }
            }
            if (totalW > 0)
                result.at<Vec4b>(r,c) = Vec4b((uchar)(accR/totalW),(uchar)(accG/totalW),(uchar)(accB/totalW),255);
            else
                result.at<Vec4b>(r,c) = Vec4b(0,0,0,0);
        }

    NSLog(@"[Equirect Fallback] Done: %dx%d (%lu frames)", width_, height_, (unsigned long)numFrames);
    return [self UIImageFromCVMat:result];
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
