#!/bin/bash
#
# Builds an OpenCV iOS XCFramework from source with both device and simulator
# support. This replaces the old device-only framework download.
#
# The XCFramework format is required because .framework cannot contain
# separate arm64 slices for iOS device and iOS Simulator simultaneously.
#
# Usage: bash scripts/download-opencv-ios.sh
#
# Prerequisites: cmake, python3, Xcode Command Line Tools
#

set -euo pipefail

OPENCV_VERSION="4.10.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRAMEWORK_DIR="${ROOT_DIR}/ios"
XCFW_PATH="${FRAMEWORK_DIR}/opencv2.xcframework"

# Skip if already present
if [ -d "${XCFW_PATH}" ]; then
  echo "[opencv] opencv2.xcframework already exists at ${XCFW_PATH}, skipping build."
  exit 0
fi

# Remove legacy device-only framework if present
if [ -d "${FRAMEWORK_DIR}/opencv2.framework" ]; then
  echo "[opencv] Removing legacy device-only opencv2.framework..."
  rm -rf "${FRAMEWORK_DIR}/opencv2.framework"
fi

# ── Check prerequisites ──────────────────────────────────────────────────────
for cmd in cmake python3 xcodebuild; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "[opencv] ERROR: $cmd is required but not found." >&2
    exit 1
  fi
done

# ── Download OpenCV source ───────────────────────────────────────────────────
SRC_DIR="/tmp/opencv-${OPENCV_VERSION}-src"
SRC_ZIP="/tmp/opencv-${OPENCV_VERSION}-source.zip"

if [ ! -d "${SRC_DIR}/platforms/ios" ]; then
  echo "[opencv] Downloading OpenCV ${OPENCV_VERSION} source..."
  DOWNLOAD_URL="https://github.com/opencv/opencv/archive/refs/tags/${OPENCV_VERSION}.zip"
  if [ ! -f "${SRC_ZIP}" ]; then
    curl -L --fail --progress-bar -o "${SRC_ZIP}" "${DOWNLOAD_URL}"
  else
    echo "[opencv] Using cached source archive at ${SRC_ZIP}"
  fi

  echo "[opencv] Extracting source..."
  rm -rf "${SRC_DIR}"
  unzip -o -q "${SRC_ZIP}" -d /tmp
  # The zip extracts to opencv-4.10.0/
  if [ -d "/tmp/opencv-${OPENCV_VERSION}" ] && [ ! -d "${SRC_DIR}" ]; then
    mv "/tmp/opencv-${OPENCV_VERSION}" "${SRC_DIR}"
  fi
fi

if [ ! -f "${SRC_DIR}/platforms/ios/build_framework.py" ]; then
  echo "[opencv] ERROR: OpenCV source not found or incomplete at ${SRC_DIR}" >&2
  exit 1
fi

# ── Build XCFramework ────────────────────────────────────────────────────────
BUILD_DIR="/tmp/opencv-${OPENCV_VERSION}-xcfw-build"

echo "[opencv] Building OpenCV ${OPENCV_VERSION} as XCFramework (device + simulator)..."
echo "[opencv] This may take 10-20 minutes on first run. Output in: ${BUILD_DIR}"

python3 "${SRC_DIR}/platforms/apple/build_xcframework.py" \
  --out "${BUILD_DIR}" \
  --iphoneos_archs arm64 \
  --iphonesimulator_archs arm64,x86_64 \
  --build_only_specified_archs \
  --without objdetect \
  --without dnn \
  --without ml \
  --without photo \
  --without video \
  --without videoio \
  --without highgui \
  --without gapi \
  --without objc \
  --disable PROTOBUF \
  --disable BUILD_opencv_python2 \
  --disable BUILD_opencv_python3

# ── Install to ios/ ──────────────────────────────────────────────────────────
BUILT_XCFW=$(find "${BUILD_DIR}" -maxdepth 1 -type d -name "opencv2.xcframework" | head -1)

if [ -z "${BUILT_XCFW}" ] || [ ! -d "${BUILT_XCFW}" ]; then
  echo "[opencv] ERROR: opencv2.xcframework not found in build output" >&2
  echo "[opencv] Build directory contents:" >&2
  ls -la "${BUILD_DIR}" >&2
  exit 1
fi

echo "[opencv] Installing xcframework to ${XCFW_PATH}..."
cp -R "${BUILT_XCFW}" "${XCFW_PATH}"

echo "[opencv] Successfully built opencv2.xcframework ($(du -sh "${XCFW_PATH}" | cut -f1))"
echo "[opencv] Supports: iOS device (arm64) + iOS Simulator (arm64, x86_64)"
