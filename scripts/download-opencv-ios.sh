#!/bin/bash
#
# Downloads the pre-built OpenCV iOS framework from the official GitHub releases.
# This avoids storing the ~578MB binary in the git repo.
#
# Usage: bash scripts/download-opencv-ios.sh
#

set -euo pipefail

OPENCV_VERSION="4.10.0"
FRAMEWORK_DIR="$(cd "$(dirname "$0")/.." && pwd)/ios"
FRAMEWORK_PATH="${FRAMEWORK_DIR}/opencv2.framework"

# Skip if already present
if [ -d "${FRAMEWORK_PATH}" ] && [ -f "${FRAMEWORK_PATH}/opencv2" ]; then
  echo "[opencv] opencv2.framework already exists at ${FRAMEWORK_PATH}, skipping download."
  exit 0
fi

echo "[opencv] Downloading OpenCV ${OPENCV_VERSION} iOS framework..."

DOWNLOAD_URL="https://github.com/opencv/opencv/releases/download/${OPENCV_VERSION}/opencv-${OPENCV_VERSION}-ios-framework.zip"
TMP_ZIP="/tmp/opencv-ios-framework-${OPENCV_VERSION}.zip"

# Download (skip if cached)
if [ ! -f "${TMP_ZIP}" ]; then
  curl -L --fail --progress-bar -o "${TMP_ZIP}" "${DOWNLOAD_URL}"
else
  echo "[opencv] Using cached download at ${TMP_ZIP}"
fi

echo "[opencv] Extracting to ${FRAMEWORK_DIR}..."

# The zip contains opencv2.framework/ at its root
unzip -o -q "${TMP_ZIP}" -d "${FRAMEWORK_DIR}"

if [ ! -d "${FRAMEWORK_PATH}" ]; then
  # Some releases nest it under a directory — find and move it
  FOUND=$(find "${FRAMEWORK_DIR}" -maxdepth 2 -type d -name "opencv2.framework" | head -1)
  if [ -n "${FOUND}" ] && [ "${FOUND}" != "${FRAMEWORK_PATH}" ]; then
    mv "${FOUND}" "${FRAMEWORK_PATH}"
  fi
fi

if [ -d "${FRAMEWORK_PATH}" ]; then
  echo "[opencv] Successfully installed opencv2.framework ($(du -sh "${FRAMEWORK_PATH}" | cut -f1))"
else
  echo "[opencv] ERROR: opencv2.framework not found after extraction" >&2
  exit 1
fi
