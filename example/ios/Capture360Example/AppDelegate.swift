import UIKit
import React
import React_RCTAppDelegate

@main
class AppDelegate: RCTAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds)
    
    let rootView = RCTRootView(
      bundleURL: sourceURL(for: nil)!,
      moduleName: "BisetkaPhotosphere",
      initialProperties: nil,
      launchOptions: launchOptions
    )
    
    let viewController = UIViewController()
    viewController.view = rootView
    
    window.rootViewController = viewController
    window.makeKeyAndVisible()
    
    return true
  }

  override func sourceURL(for bridge: RCTBridge!) -> URL? {
    #if DEBUG
      return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
    #else
      return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}
