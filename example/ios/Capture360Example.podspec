Pod::Spec.new do |s|
  s.name         = "@sourceship/capture360-example"
  s.version      = "1.0.0"
  s.summary      = "Example app for @sourceship/capture360"
  s.description  = <<-DESC
                   Example application demonstrating Capture360 React Native module usage.
                   DESC
  s.homepage     = "https://github.com/sourceship/capture360"
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.author       = "Sourceship"
  s.platform     = :ios, "15.0"
  s.source       = { :git => "https://github.com/sourceship/capture360.git", :tag => "v#{s.version}" }

  s.dependency 'React-Core'
  s.dependency '@sourceship/capture360', "#{s.version}"

  s.source_files = "ios/**/*.{h,m,swift}"
end
