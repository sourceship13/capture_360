Pod::Spec.new do |s|
  s.name         = "@sourceship/capture360"
  s.version      = "1.0.0"
  s.summary      = "React Native panorama capture and equirectangular stitching"
  s.homepage     = "https://github.com/bisetka/react-native-bisetka-photosphere"
  s.license      = { :type => "MIT" }
  s.author       = "Bisetka"
  s.source       = { :git => "https://github.com/bisetka/react-native-bisetka-photosphere.git", :tag => "v#{s.version}" }
  s.platform     = :ios, "15.0"

  # Include all native source files EXCEPT the standalone app files
  s.source_files = [
    "ios/RCTPhotosphereModule.{h,mm}",
    "ios/BisetkaPhotosphere/OpenCVWrapper.{h,mm}",
    "ios/BisetkaPhotosphere/ARCameraView.{h,m}",
    "ios/BisetkaPhotosphere/ARCameraViewManager.m",
    "ios/BisetkaPhotosphere/RCTNativeDeviceInfoModule.{h,m}",
    "ios/BisetkaPhotosphere/RCTVideoRecorderModule.{h,m}",
    "ios/BisetkaPhotosphere/RCTModuleProvider.{h,m}",
    "ios/BisetkaPhotosphere/PhotosphereStitcher.{m,swift}",
  ]

  # Exclude app-only files
  s.exclude_files = [
    "ios/BisetkaPhotosphere/AppDelegate.swift",
    "ios/BisetkaPhotosphere/BisetkaPhotosphere-Bridging-Header.h",
  ]

  # OpenCV framework — downloaded via prepare_command, not checked into git
  s.vendored_frameworks = "ios/opencv2.framework"
  s.prepare_command = "bash scripts/download-opencv-ios.sh"

  s.frameworks = "ARKit", "SceneKit", "CoreMotion", "AVFoundation", "UIKit"

  s.dependency "React-Core"

  # Needed because we mix ObjC / ObjC++ / Swift
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "SWIFT_OBJC_BRIDGING_HEADER" => ""
  }
end
