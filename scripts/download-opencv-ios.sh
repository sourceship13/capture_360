#!/bin/bash

# Download OpenCV for iOS
# This script downloads and extracts the OpenCV framework required for Capture360

set -e

OPENCV_VERSION="4.8.1"
DOWNLOAD_URL="https://github.com/opencv/opencv/releases/download/${OPENCV_VERSION}/opencv-ios-${OPENCV_VERSION}.zip"
EXTRACT_DIR="$(dirname "$0")/../ios"
FRAMEWORK_PATH="${EXTRACT_DIR}/opencv2.framework"

echo "📥 Downloading OpenCV ${OPENCV_VERSION} for iOS..."
echo "URL: ${DOWNLOAD_URL}"

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

# Download
if ! curl -L --progress-bar "${DOWNLOAD_URL}" -o "${TEMP_DIR}/opencv.zip"; then
    echo "❌ Failed to download OpenCV"
    echo "Check your internet connection and try again"
    exit 1
fi

echo "📦 Extracting OpenCV..."

# Extract
if ! unzip -q "${TEMP_DIR}/opencv.zip" -d "${TEMP_DIR}"; then
    echo "❌ Failed to extract OpenCV"
    exit 1
fi

# Move framework to ios directory
EXTRACTED_FRAMEWORK=$(find "${TEMP_DIR}" -name "opencv2.framework" -type d | head -1)

if [ -z "${EXTRACTED_FRAMEWORK}" ]; then
    echo "❌ Could not find opencv2.framework in downloaded archive"
    exit 1
fi

# Remove old framework if it exists
if [ -d "${FRAMEWORK_PATH}" ]; then
    rm -rf "${FRAMEWORK_PATH}"
fi

# Copy new framework
cp -r "${EXTRACTED_FRAMEWORK}" "${FRAMEWORK_PATH}"

echo "✅ OpenCV ${OPENCV_VERSION} installed successfully"
echo "📍 Location: ${FRAMEWORK_PATH}"
echo ""
echo "Next steps:"
echo "  1. cd ios && pod install && cd .."
echo "  2. Build your app"
