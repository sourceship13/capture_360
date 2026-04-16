Pod::Spec.new do |s|
  s.name         = "capture360"
  s.version      = "1.0.0"
  s.summary      = "React Native panorama capture and equirectangular stitching with OpenCV"
  s.homepage     = "https://github.com/sera-tech/capture360"
  s.license      = { :type => "UNLICENSED" }
  s.author       = "Sera Tech"
  s.source       = { :git => "https://github.com/sera-tech/capture360.git", :tag => "v#{s.version}" }
  s.platform     = :ios, "15.0"

  # Include all native source files
  s.source_files = [
    "ios/RCTPhotosphereModule.{h,mm}",
    "ios/Capture360/OpenCVWrapper.{h,mm}",
    "ios/Capture360/ARCameraView.{h,m}",
    "ios/Capture360/ARCameraViewManager.m",
    "ios/Capture360/RCTNativeDeviceInfoModule.{h,m}",
    "ios/Capture360/RCTVideoRecorderModule.{h,m}",
    "ios/Capture360/RCTModuleProvider.{h,m}",
    "ios/Capture360/PhotosphereStitcher.{m,swift}",
  ]

  # Exclude app-only files
  s.exclude_files = []

  s.resource_bundles = {
    "capture360-privacy" => ["ios/Capture360/PrivacyInfo.xcprivacy"],
  }

  s.public_header_files = [
    "ios/RCTPhotosphereModule.h",
    "ios/Capture360/OpenCVWrapper.h",
    "ios/Capture360/ARCameraView.h",
    "ios/Capture360/RCTNativeDeviceInfoModule.h",
    "ios/Capture360/RCTVideoRecorderModule.h",
    "ios/Capture360/RCTModuleProvider.h",
  ]

  # OpenCV xcframework — built from source via prepare_command, not checked into git.
  # The xcframework contains both device (arm64) and simulator (arm64, x86_64) slices.
  s.vendored_frameworks = "ios/opencv2.xcframework"
  s.prepare_command = "bash scripts/download-opencv-ios.sh"

  s.frameworks = "ARKit", "SceneKit", "CoreMotion", "AVFoundation", "UIKit"

  s.dependency "React-Core"

  # Needed because we mix ObjC / ObjC++ / Swift
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "DEFINES_MODULE" => "YES",
  }
end
