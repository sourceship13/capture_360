import UIKit
import opencv2

extension UIImage {
  /// Convert UIImage to OpenCV Mat
  func toCVMat() -> Mat? {
    guard let cgImage = self.cgImage else { return nil }
    
    let width = cgImage.width
    let height = cgImage.height
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    
    let mat = Mat(rows: Int32(height), cols: Int32(width), type: CvType.CV_8UC4)
    
    guard let context = CGContext(
      data: mat.dataPointer(),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: mat.step1(),
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return nil
    }
    
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    
    // Convert RGBA to RGB (OpenCV stitcher expects 3 channels)
    let rgb = Mat()
    Imgproc.cvtColor(src: mat, dst: rgb, code: .COLOR_RGBA2RGB)
    
    return rgb
  }
}

extension Mat {
  /// Convert OpenCV Mat to UIImage
  func toUIImage() -> UIImage? {
    // Ensure 3 or 4 channels
    var displayMat = self
    if channels() == 1 {
      let rgb = Mat()
      Imgproc.cvtColor(src: self, dst: rgb, code: .COLOR_GRAY2RGB)
      displayMat = rgb
    }
    
    // Convert to RGBA for UIImage
    let rgba = Mat()
    if displayMat.channels() == 3 {
      Imgproc.cvtColor(src: displayMat, dst: rgba, code: .COLOR_RGB2RGBA)
    } else {
      rgba = displayMat
    }
    
    let width = Int(rgba.cols())
    let height = Int(rgba.rows())
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    
    guard let context = CGContext(
      data: rgba.dataPointer(),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: rgba.step1(),
      space: colorSpace,
      bitmapInfo: bitmapInfo.rawValue
    ) else {
      return nil
    }
    
    guard let cgImage = context.makeImage() else { return nil }
    return UIImage(cgImage: cgImage)
  }
}
