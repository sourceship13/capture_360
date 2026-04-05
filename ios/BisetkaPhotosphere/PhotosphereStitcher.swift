import Foundation
import UIKit
import opencv2

@objc(PhotosphereStitcher)
class PhotosphereStitcher: NSObject {
  
  // MARK: - Basic Horizontal Stitching (3-photo test)
  @objc
  func stitchHorizontal(_ imageURIs: [String], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard imageURIs.count >= 2 else {
      reject("INVALID_INPUT", "Need at least 2 images to stitch", nil)
      return
    }
    
    // Load images
    var images: [UIImage] = []
    for uri in imageURIs {
      guard let url = URL(string: uri),
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data) else {
        reject("IMAGE_LOAD_FAILED", "Failed to load image: \(uri)", nil)
        return
      }
      images.append(image)
    }
    
    // For now: simple side-by-side composition (no feature matching yet)
    // This will show gaps if overlap isn't perfect
    guard let stitched = simpleHorizontalStitch(images: images) else {
      reject("STITCH_FAILED", "Failed to create stitched image", nil)
      return
    }
    
    // Save stitched image
    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("stitched_\(UUID().uuidString).jpg")
    
    guard let jpegData = stitched.jpegData(compressionQuality: 0.9) else {
      reject("EXPORT_FAILED", "Failed to convert image to JPEG", nil)
      return
    }
    
    do {
      try jpegData.write(to: tempURL)
      resolve(tempURL.absoluteString)
    } catch {
      reject("SAVE_FAILED", "Failed to save stitched image: \(error.localizedDescription)", nil)
    }
  }
  
  // MARK: - OpenCV Feature-Based Stitching
  private func simpleHorizontalStitch(images: [UIImage]) -> UIImage? {
    guard !images.isEmpty else { return nil }
    
    // Convert UIImages to cv::Mat
    var cvImages: [Mat] = []
    for image in images {
      guard let mat = image.toCVMat() else { continue }
      cvImages.append(mat)
    }
    
    guard !cvImages.isEmpty else { return nil }
    
    // Create OpenCV Stitcher
    let stitcher = Stitcher.create(mode: .PANORAMA)
    
    // Configure stitcher for photospheres
    stitcher.setRegistrationResol(0.6)  // Medium resolution for feature detection
    stitcher.setSeamEstimationResol(0.1)  // Fine seam blending
    stitcher.setPanoConfidenceThresh(0.5)  // Lower threshold for indoor/low-texture scenes
    
    // Stitch images
    let pano = Mat()
    let status = stitcher.stitch(cvImages, pano: pano)
    
    guard status == .OK else {
      print("[Stitcher] Failed with status: \(status.rawValue)")
      // Fallback to simple concat if stitching fails
      return fallbackSimpleConcat(images: images)
    }
    
    // Convert cv::Mat back to UIImage
    return pano.toUIImage()
  }
  
  // MARK: - Fallback simple concat (if OpenCV stitching fails)
  private func fallbackSimpleConcat(images: [UIImage]) -> UIImage? {
    guard !images.isEmpty else { return nil }
    
    let maxHeight = images.map { $0.size.height }.max() ?? 0
    let totalWidth = images.reduce(0) { $0 + $1.size.width }
    
    let size = CGSize(width: totalWidth, height: maxHeight)
    
    UIGraphicsBeginImageContextWithOptions(size, false, 0.0)
    defer { UIGraphicsEndImageContext() }
    
    var xOffset: CGFloat = 0
    for image in images {
      let yOffset = (maxHeight - image.size.height) / 2
      image.draw(at: CGPoint(x: xOffset, y: yOffset))
      xOffset += image.size.width
    }
    
    return UIGraphicsGetImageFromCurrentImageContext()
  }
  
  // MARK: - Equirectangular composition (full 360° sphere)
  @objc
  func composeEquirect(_ shots: [[String: Any]], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    // Parse shot metadata (uri, yaw, pitch)
    var shotData: [(image: UIImage, yaw: Double, pitch: Double)] = []
    
    for shot in shots {
      guard let uri = shot["uri"] as? String,
            let yaw = shot["yaw"] as? Double,
            let pitch = shot["pitch"] as? Double,
            let url = URL(string: uri),
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data) else {
        continue
      }
      shotData.append((image, yaw, pitch))
    }
    
    guard !shotData.isEmpty else {
      reject("NO_VALID_SHOTS", "No valid shots found", nil)
      return
    }
    
    // Create equirectangular canvas (2:1 aspect ratio for 360°)
    let equirectWidth: CGFloat = 4096
    let equirectHeight: CGFloat = 2048
    let size = CGSize(width: equirectWidth, height: equirectHeight)
    
    UIGraphicsBeginImageContextWithOptions(size, true, 1.0)
    defer { UIGraphicsEndImageContext() }
    
    guard let context = UIGraphicsGetCurrentContext() else {
      reject("CONTEXT_FAILED", "Failed to create graphics context", nil)
      return
    }
    
    // Fill with black background
    context.setFillColor(UIColor.black.cgColor)
    context.fill(CGRect(origin: .zero, size: size))
    
    // Project each shot onto the equirectangular canvas
    for shot in shotData {
      projectImageToEquirect(image: shot.image, yaw: shot.yaw, pitch: shot.pitch, context: context, canvasSize: size)
    }
    
    guard let equirect = UIGraphicsGetImageFromCurrentImageContext() else {
      reject("RENDER_FAILED", "Failed to render equirectangular image", nil)
      return
    }
    
    // Save
    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("equirect_\(UUID().uuidString).jpg")
    
    guard let jpegData = equirect.jpegData(compressionQuality: 0.92) else {
      reject("EXPORT_FAILED", "Failed to convert equirect to JPEG", nil)
      return
    }
    
    do {
      try jpegData.write(to: tempURL)
      resolve(tempURL.absoluteString)
    } catch {
      reject("SAVE_FAILED", "Failed to save equirect: \(error.localizedDescription)", nil)
    }
  }
  
  // MARK: - Project image onto equirectangular canvas
  private func projectImageToEquirect(image: UIImage, yaw: Double, pitch: Double, context: CGContext, canvasSize: CGSize) {
    
    // Convert yaw/pitch to equirectangular pixel coordinates
    // yaw: -180° to +180° → 0 to canvasWidth
    // pitch: -90° to +90° → 0 to canvasHeight
    
    let normalizedYaw = (yaw + 180.0) / 360.0  // 0.0 to 1.0
    let normalizedPitch = (90.0 - pitch) / 180.0  // 0.0 to 1.0 (flip Y)
    
    let centerX = normalizedYaw * canvasSize.width
    let centerY = normalizedPitch * canvasSize.height
    
    // iPhone wide camera HFOV ~55° (measured empirically)
    let fovDegrees: CGFloat = 55.0
    let imageWidthInCanvas = (fovDegrees / 360.0) * canvasSize.width
    let imageHeightInCanvas = imageWidthInCanvas * (image.size.height / image.size.width)
    
    let rect = CGRect(
      x: centerX - imageWidthInCanvas / 2,
      y: centerY - imageHeightInCanvas / 2,
      width: imageWidthInCanvas,
      height: imageHeightInCanvas
    )
    
    context.draw(image.cgImage!, in: rect)
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
