#!/bin/bash
# Add PhotosphereStitcher Swift files to Xcode project

set -e

echo "📦 Adding PhotosphereStitcher to Xcode project..."

cd "$(dirname "$0")/ios"

# Open Xcode project and add files
# (Manual step required — Xcode's pbxproj format is fragile)

cat <<EOF

⚠️  MANUAL STEPS REQUIRED:

1. Open BisetkaPhotosphere.xcworkspace in Xcode
2. Right-click on BisetkaPhotosphere group in navigator
3. Add Files to "BisetkaPhotosphere"...
4. Select:
   - BisetkaPhotosphere/PhotosphereStitcher.swift
   - BisetkaPhotosphere/PhotosphereStitcher.m
5. Make sure "Copy items if needed" is UNCHECKED (files already in place)
6. Target membership: BisetkaPhotosphere ✅
7. Build the project (⌘B)

If you get bridging header errors:
- Build Settings → Objective-C Bridging Header → Set to:
  BisetkaPhotosphere/BisetkaPhotosphere-Bridging-Header.h

EOF
