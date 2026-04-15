import Foundation
import UIKit
import React

@objc(PhotosphereStitcher)
class PhotosphereStitcher: NSObject {
  
  // MARK: - Equirectangular Composition
  @objc
  func composeEquirect(_ imageDataArray: [[String: Any]], 
                      resolver resolve: @escaping RCTPromiseResolveBlock, 
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard !imageDataArray.isEmpty else {
      reject("INVALID_INPUT", "No images provided", nil)
      return
    }
    
    // Canvas size: 4096x2048 for 2:1 equirectangular
    let canvasSize = CGSize(width: 4096, height: 2048)
    
    UIGraphicsBeginImageContextWithOptions(canvasSize, false, 1.0)
    defer { UIGraphicsEndImageContext() }
    
    guard let context = UIGraphicsGetCurrentContext() else {
      reject("CONTEXT_ERROR", "Failed to create graphics context", nil)
      return
    }
    
    // Fill with black background
    context.setFillColor(UIColor.black.cgColor)
    context.fill(CGRect(origin: .zero, size: canvasSize))
    
    // Process each image
    for imageData in imageDataArray {
      guard let uri = imageData["uri"] as? String,
            let yaw = imageData["yaw"] as? Double,
            let pitch = imageData["pitch"] as? Double else {
        continue
      }
      
      // Load image
      guard let url = URL(string: uri),
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data) else {
        print("[Stitcher] Failed to load image: \(uri)")
        continue
      }
      
      // Project rectilinear → equirectangular using OpenCV
      projectImageToEquirect(image: image, yaw: yaw, pitch: pitch, context: context, canvasSize: canvasSize)
    }
    
    // Convert final canvas to base64
    guard let finalImage = UIGraphicsGetImageFromCurrentImageContext(),
          let pngData = finalImage.pngData() else {
      reject("EXPORT_ERROR", "Failed to export final image", nil)
      return
    }
    
    let base64 = pngData.base64EncodedString()
    resolve(["uri": "data:image/png;base64,\(base64)"])
  }
  
  // MARK: - Project image onto equirectangular canvas with OpenCV warping
  private func projectImageToEquirect(image: UIImage, yaw: Double, pitch: Double, context: CGContext, canvasSize: CGSize) {
    
    // Use OpenCV wrapper to warp rectilinear → equirectangular
    let warpedImage = OpenCVWrapper.warp(toEquirect: image,
                                         yaw: yaw,
                                         pitch: pitch,
                                         canvasSize: canvasSize,
                                         cameraHFOV: 55.0)  // iPhone wide camera HFOV
    
    // Composite with alpha blending for smooth overlaps
    context.saveGState()
    context.setBlendMode(.normal)
    context.setAlpha(0.85)  // blend overlapping regions
    warpedImage.draw(in: CGRect(origin: .zero, size: canvasSize))
    context.restoreGState()
  }
}
