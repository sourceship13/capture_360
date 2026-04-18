#!/bin/bash
#
# Downloads a pre-built OpenCV iOS XCFramework from GitHub Releases.
# Supports iOS device (arm64) and Simulator (arm64, x86_64).
#
# Usage: bash scripts/download-opencv-ios.sh
#
# Prerequisites: curl, unzip
#

set -euo pipefail

OPENCV_VERSION="4.10.0"
RELEASE_TAG="opencv-4.10.0-ios"
ASSET_NAME="opencv2-xcframework-4.10.0-ios.zip"
DOWNLOAD_URL="https://github.com/sourceship13/capture360/releases/download/${RELEASE_TAG}/${ASSET_NAME}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRAMEWORK_DIR="${ROOT_DIR}/ios"
XCFW_PATH="${FRAMEWORK_DIR}/opencv2.xcframework"

# Skip if already present
if [ -d "${XCFW_PATH}" ]; then
  echo "[opencv] opencv2.xcframework already exists at ${XCFW_PATH}, skipping download."
  exit 0
fi

# Remove legacy device-only framework if present
if [ -d "${FRAMEWORK_DIR}/opencv2.framework" ]; then
  echo "[opencv] Removing legacy device-only opencv2.framework..."
  rm -rf "${FRAMEWORK_DIR}/opencv2.framework"
fi

# ── Download pre-built XCFramework ──────────────────────────────────────────
TMP_ZIP="/tmp/${ASSET_NAME}"

echo "[opencv] Downloading pre-built opencv2.xcframework ${OPENCV_VERSION}..."
curl -L --fail --progress-bar -o "${TMP_ZIP}" "${DOWNLOAD_URL}"

echo "[opencv] Extracting..."
TMP_DIR=$(mktemp -d)
unzip -q "${TMP_ZIP}" -d "${TMP_DIR}"
rm -f "${TMP_ZIP}"

# ── Install to ios/ ──────────────────────────────────────────────────────────
if [ ! -d "${TMP_DIR}/opencv2.xcframework" ]; then
  echo "[opencv] ERROR: opencv2.xcframework not found in downloaded archive" >&2
  ls -la "${TMP_DIR}" >&2
  exit 1
fi

mv "${TMP_DIR}/opencv2.xcframework" "${XCFW_PATH}"
rm -rf "${TMP_DIR}"

echo "[opencv] Successfully installed opencv2.xcframework ($(du -sh "${XCFW_PATH}" | cut -f1))"
echo "[opencv] Supports: iOS device (arm64) + iOS Simulator (arm64, x86_64)"
