/**
 * RCTPhotosphereModule.mm
 *
 * Panorama stitching: loads each JPEG, normalises orientation,
 * then composites frames LEFT-TO-RIGHT with 30% overlap and a
 * cross-fade seam.  Uses UIGraphicsBeginImageContextWithOptions.
 *
 * The output is named  pano_WxH_<timestamp>.jpg  so pixel dimensions
 * are visible in the resolved path for diagnostics.
 */

#import "RCTPhotosphereModule.h"
#import <UIKit/UIKit.h>

// ---------------------------------------------------------------------------
// NormaliseOrientation
//
// UIImage imageWithContentsOfFile: honours the EXIF orientation in its
// .size property and in drawInRect:  (i.e. img.size returns the DISPLAY
// dimensions).  By re-drawing into a fresh context of that display size we
// bake the rotation into the pixels and get a UIImageOrientationUp image.
// ---------------------------------------------------------------------------
static UIImage *NormaliseOrientation(UIImage *img) {
    if (!img) return nil;
    if (img.imageOrientation == UIImageOrientationUp) return img;
    CGSize sz = img.size;   // already the post-EXIF display dimensions
    UIGraphicsBeginImageContextWithOptions(sz, YES, 1.0);
    [img drawInRect:CGRectMake(0, 0, sz.width, sz.height)];
    UIImage *r = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();
    return r ?: img;
}

// ---------------------------------------------------------------------------
// ScaleToHeight — proportional scale so every frame shares one height.
// ---------------------------------------------------------------------------
static UIImage *ScaleToHeight(UIImage *img, CGFloat targetH) {
    if (fabs(img.size.height - targetH) < 1.0) return img;
    CGFloat ratio = targetH / img.size.height;
    CGSize  sz    = CGSizeMake(img.size.width * ratio, targetH);
    UIGraphicsBeginImageContextWithOptions(sz, YES, 1.0);
    [img drawInRect:CGRectMake(0, 0, sz.width, sz.height)];
    UIImage *r = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();
    return r ?: img;
}

// ===========================================================================

@implementation RCTPhotosphereModule

RCT_EXPORT_MODULE(NativePhotosphere)

+ (BOOL)requiresMainQueueSetup { return NO; }

// ---------------------------------------------------------------------------
// composeEquirect — Places captured photos on a 2:1 equirectangular canvas.
//
// Each entry in `shots` is { path, yaw, pitch, hFov, vFov } describing
// where the camera was pointing and the camera's field of view.
//
// Uncaptured areas stay black → partial captures are viewable immediately.
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(composeEquirect:(NSArray *)shots
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{

        const NSInteger kCanvasW = 4096;
        const NSInteger kCanvasH = 2048;

        // Create a black canvas
        UIGraphicsBeginImageContextWithOptions(
            CGSizeMake(kCanvasW, kCanvasH), YES, 1.0);
        CGContextRef ctx = UIGraphicsGetCurrentContext();
        [[UIColor blackColor] setFill];
        CGContextFillRect(ctx, CGRectMake(0, 0, kCanvasW, kCanvasH));

        NSInteger drawn = 0;

        for (NSDictionary *shot in shots) {
            NSString *path = shot[@"path"];
            double yawDeg   = [shot[@"yaw"]   doubleValue];
            double pitchDeg = [shot[@"pitch"]  doubleValue];
            double hFov     = [shot[@"hFov"]   doubleValue];
            double vFov     = [shot[@"vFov"]   doubleValue];

            NSString *posix = [path hasPrefix:@"file://"]
                ? [[NSURL URLWithString:path] path]
                : path;
            UIImage *raw = [UIImage imageWithContentsOfFile:posix];
            if (!raw) {
                NSLog(@"[Equirect] WARN: can't load %@", posix);
                continue;
            }
            UIImage *img = NormaliseOrientation(raw);

            // Map (yaw, pitch) → equirectangular canvas position.
            //
            // Equirectangular: x ∈ [0, W] maps to yaw [-180°, 180°]
            //                  y ∈ [0, H] maps to pitch [90°, -90°]
            //
            // Centre of this photo on canvas:
            double cx = ((yawDeg + 180.0) / 360.0) * kCanvasW;
            double cy = ((90.0 - pitchDeg) / 180.0) * kCanvasH;

            // Extent this photo covers:
            double pw = (hFov / 360.0) * kCanvasW;
            double ph = (vFov / 180.0) * kCanvasH;

            CGRect destRect = CGRectMake(cx - pw / 2.0, cy - ph / 2.0, pw, ph);

            NSLog(@"[Equirect] frame yaw=%.1f pitch=%.1f → rect=(%.0f,%.0f,%.0f,%.0f)",
                  yawDeg, pitchDeg, destRect.origin.x, destRect.origin.y,
                  destRect.size.width, destRect.size.height);

            // Handle wrapping: if a photo straddles the left/right edge (yaw ≈ ±180°),
            // draw it twice — once on each side.
            [img drawInRect:destRect];
            if (destRect.origin.x < 0) {
                CGRect wrapRight = destRect;
                wrapRight.origin.x += kCanvasW;
                [img drawInRect:wrapRight];
            }
            if (CGRectGetMaxX(destRect) > kCanvasW) {
                CGRect wrapLeft = destRect;
                wrapLeft.origin.x -= kCanvasW;
                [img drawInRect:wrapLeft];
            }

            drawn++;
        }

        UIImage *canvas = UIGraphicsGetImageFromCurrentImageContext();
        UIGraphicsEndImageContext();

        if (drawn == 0) {
            reject(@"COMPOSE_ERROR",
                   @"No images could be loaded.",
                   nil);
            return;
        }

        // Force orientation to Up and write JPEG
        CGImageRef cgRaw = canvas.CGImage;
        UIImage *equirect = [UIImage imageWithCGImage:cgRaw
                                                scale:1.0
                                          orientation:UIImageOrientationUp];
        NSData *jpeg = UIImageJPEGRepresentation(equirect, 0.90);
        if (!jpeg) {
            reject(@"COMPOSE_ERROR", @"JPEG encoding returned nil.", nil);
            return;
        }

        NSString *name =
            [NSString stringWithFormat:@"equirect_%ldx%ld_%ld.jpg",
             (long)kCanvasW, (long)kCanvasH,
             (long)[[NSDate date] timeIntervalSince1970]];
        NSString *outPath =
            [NSTemporaryDirectory() stringByAppendingPathComponent:name];

        NSError *err = nil;
        if (![jpeg writeToFile:outPath options:NSDataWritingAtomic error:&err]) {
            reject(@"COMPOSE_ERROR",
                   err.localizedDescription ?: @"Write failed.", err);
        } else {
            NSLog(@"[Equirect] saved (%ld photos) → %@", (long)drawn, outPath);
            resolve(outPath);
        }
    });
}

// ---------------------------------------------------------------------------
// stitchImages — Legacy left-to-right linear compositor (kept for reference)
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(stitchImages:(NSArray<NSString *> *)imagePaths
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{

        // 1. Load and normalise every frame
        NSMutableArray<UIImage *> *frames = [NSMutableArray array];
        for (NSString *path in imagePaths) {
            NSString *posix = [path hasPrefix:@"file://"]
                ? [[NSURL URLWithString:path] path]
                : path;
            UIImage *raw = [UIImage imageWithContentsOfFile:posix];
            if (!raw) {
                NSLog(@"[Pano] WARN: could not load %@", posix);
                continue;
            }
            NSLog(@"[Pano] raw size=%.0fx%.0f orient=%ld",
                  raw.size.width, raw.size.height, (long)raw.imageOrientation);
            UIImage *norm = NormaliseOrientation(raw);
            NSLog(@"[Pano] norm size=%.0fx%.0f orient=%ld",
                  norm.size.width, norm.size.height, (long)norm.imageOrientation);
            [frames addObject:norm];
        }

        if (frames.count < 2) {
            reject(@"STITCH_ERROR",
                   [NSString stringWithFormat:
                    @"Need at least 2 images; loaded %lu/%lu.",
                    (unsigned long)frames.count,
                    (unsigned long)imagePaths.count], nil);
            return;
        }

        // 2. Normalise all frames to the same height as frame 0
        CGFloat targetH = ((UIImage *)frames[0]).size.height;
        NSMutableArray<UIImage *> *scaled =
            [NSMutableArray arrayWithCapacity:frames.count];
        for (UIImage *f in frames)
            [scaled addObject:ScaleToHeight(f, targetH)];

        // 3. Pre-compute the LEFT-EDGE x-position of each frame on the canvas.
        //
        //   Each successive frame is shifted right by (1 - kOverlap) of the
        //   previous frame width, so adjacent frames share a kOverlap strip.
        //
        // Place frames EXACTLY side by side with NO assumed overlap.
        // This preserves 100% of every frame's content.
        // A thin feather at each seam edge hides the hard cut.
        const CGFloat kOverlap = 0.0;
        const CGFloat kFeatherPx = 40.0; // pixels of soft blend at each seam
        const CGFloat kMaxW    = 4096.0;

        NSMutableArray<NSNumber *> *xs =
            [NSMutableArray arrayWithCapacity:scaled.count];
        CGFloat cursor = 0.0;
        for (NSUInteger i = 0; i < scaled.count; i++) {
            [xs addObject:@(cursor)];
            if (i + 1 < scaled.count)
                cursor += ((UIImage *)scaled[i]).size.width * (1.0 - kOverlap);
        }
        // Canvas width  = x-position of last frame + its own width
        CGFloat rawW = [xs.lastObject doubleValue]
                       + ((UIImage *)scaled.lastObject).size.width;

        CGFloat outScale = MIN(1.0, kMaxW / rawW);
        NSInteger canvasW = MAX(1, (NSInteger)(rawW    * outScale));
        NSInteger canvasH = MAX(1, (NSInteger)(targetH * outScale));

        NSLog(@"[Pano] canvas=%ldx%ld  scale=%.4f  n=%lu",
              (long)canvasW, (long)canvasH, outScale,
              (unsigned long)scaled.count);

        // 4. Draw all frames left-to-right with cross-fade seams
        UIGraphicsBeginImageContextWithOptions(
            CGSizeMake(canvasW, canvasH), YES, 1.0);

        for (NSUInteger i = 0; i < scaled.count; i++) {
            UIImage *img  = scaled[i];
            CGFloat  x    = [xs[i] doubleValue] * outScale;
            CGFloat  imgW = img.size.width  * outScale;
            CGFloat  imgH = img.size.height * outScale;   // same as canvasH

            NSLog(@"[Pano] frame%lu → x=%.0f w=%.0f h=%.0f", (unsigned long)i, x, imgW, imgH);

            // (a) Draw this frame fully at its canvas position
            [img drawInRect:CGRectMake(x, 0.0, imgW, imgH)];

            // (b) Feather the seam: at the LEFT edge of this frame, overdraw a
            //     thin strip with the previous frame at linearly-decreasing alpha
            //     (1 at the very left → 0 at kFeatherPx in) to blend the hard cut.
            if (i > 0) {
                UIImage *prev = scaled[i - 1];
                CGFloat  px   = [xs[i - 1] doubleValue] * outScale;
                CGFloat  pw   = prev.size.width * outScale;

                CGFloat fadeW = MIN(kFeatherPx * outScale, imgW * 0.05);
                const NSInteger kSlices = 16;
                CGFloat sw = fadeW / (CGFloat)kSlices;

                CGContextRef ctx = UIGraphicsGetCurrentContext();
                for (NSInteger s = 0; s < kSlices; s++) {
                    // alpha: 1.0 at seam → 0 at feather edge
                    CGFloat alpha  = 1.0 - (CGFloat)s / (CGFloat)(kSlices - 1);
                    CGFloat sliceX = x + (CGFloat)s * sw;

                    CGContextSaveGState(ctx);
                    CGContextSetAlpha(ctx, alpha);
                    CGContextClipToRect(ctx, CGRectMake(sliceX, 0.0, sw, imgH));
                    [prev drawInRect:CGRectMake(px, 0.0, pw, imgH)];
                    CGContextRestoreGState(ctx);
                }
            }
        }

        UIImage *ctx_img = UIGraphicsGetImageFromCurrentImageContext();
        UIGraphicsEndImageContext();

        if (!ctx_img) {
            reject(@"STITCH_ERROR", @"Composite returned nil.", nil);
            return;
        }

        // Force UIImageOrientationUp before JPEG encoding.
        //
        // UIGraphicsGetImageFromCurrentImageContext() can return an image whose
        // imageOrientation is non-Up on certain iOS versions.  If we pass such
        // an image to UIImageJPEGRepresentation, it embeds an EXIF rotation tag.
        // React Native's Image.getSize respects that tag and reports portrait
        // dimensions for a landscape JPEG — making the panorama appear
        // vertically stacked on screen.
        //
        // The fix: use the raw CGImage pixels (no orientation metadata) and
        // wrap them in a brand-new UIImage pinned to UIImageOrientationUp.
        // UIImageJPEGRepresentation on an Up image writes no rotation EXIF.
        CGImageRef cgRaw = ctx_img.CGImage;
        NSLog(@"[Pano] CGImage raw size: %zu x %zu  UIImage orient: %ld",
              CGImageGetWidth(cgRaw), CGImageGetHeight(cgRaw),
              (long)ctx_img.imageOrientation);

        UIImage *panorama = [UIImage imageWithCGImage:cgRaw
                                               scale:1.0
                                         orientation:UIImageOrientationUp];
        NSLog(@"[Pano] panorama size: %.0fx%.0f orient: %ld",
              panorama.size.width, panorama.size.height,
              (long)panorama.imageOrientation);

        // 5. Encode as JPEG and write to tmp
        NSData *jpeg = UIImageJPEGRepresentation(panorama, 0.88);
        if (!jpeg) {
            reject(@"STITCH_ERROR", @"JPEG encoding returned nil.", nil);
            return;
        }

        // Embed dimensions in filename for easy diagnostics
        NSString *name =
            [NSString stringWithFormat:@"pano_%ldx%ld_%ld.jpg",
             (long)canvasW, (long)canvasH,
             (long)[[NSDate date] timeIntervalSince1970]];
        NSString *outPath =
            [NSTemporaryDirectory() stringByAppendingPathComponent:name];

        NSError *err = nil;
        if (![jpeg writeToFile:outPath options:NSDataWritingAtomic error:&err]) {
            reject(@"STITCH_ERROR",
                   err.localizedDescription ?: @"Write failed.", err);
        } else {
            NSLog(@"[Pano] saved → %@", outPath);
            resolve(outPath);
        }
    });
}

// ---------------------------------------------------------------------------
// readFileBase64 — read a file from disk and return its contents as base64.
// Used to pass the stitched panorama into the WebView-based sphere viewer.
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(readFileBase64:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSString *posix = [filePath hasPrefix:@"file://"]
        ? [[NSURL URLWithString:filePath] path]
        : filePath;
    NSData *data = [NSData dataWithContentsOfFile:posix];
    if (data) {
        resolve([data base64EncodedStringWithOptions:0]);
    } else {
        reject(@"READ_ERROR",
               [NSString stringWithFormat:@"Could not read file: %@", posix],
               nil);
    }
}

@end
