#!/usr/bin/env python3

import re
import sys
import os

# Read the xcconfig file
xcconfig_file = sys.argv[1]

with open(xcconfig_file, "r") as f:
    content = f.read()

# Fix SWIFT_INCLUDE_PATHS - use Headers/Public for static libraries
content = content.replace(
    'SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI"',
    'SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_ROOT}/Headers/Public"'
)

content = content.replace(
    'SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper"',
    'SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_ROOT}/Headers/Public"'
)

# Fix OTHER_MODULE_VERIFIER_FLAGS - use Headers/Public for static libraries
content = content.replace(
    '"${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI"',
    '"${PODS_ROOT}/Headers/Public"'
)

content = content.replace(
    '"${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper"',
    '"${PODS_ROOT}/Headers/Public"'
)

content = content.replace(
    '"${PODS_CONFIGURATION_BUILD_DIR}/RCTTypeSafety"',
    '"${PODS_ROOT}/Headers/Public"'
)

content = content.replace(
    '"${PODS_CONFIGURATION_BUILD_DIR}/RCTDeprecation"',
    '"${PODS_ROOT}/Headers/Public"'
)

content = content.replace(
    '"${PODS_CONFIGURATION_BUILD_DIR}/React"',
    '"${PODS_ROOT}/Headers/Public"'
)

# Fix modulemap paths
content = content.replace(
    '${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI/RCTSwiftUI.modulemap',
    '${PODS_ROOT}/Headers/Public/RCTSwiftUI/RCTSwiftUI.modulemap'
)

content = content.replace(
    '${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper/RCTSwiftUIWrapper.modulemap',
    '${PODS_ROOT}/Headers/Public/RCTSwiftUIWrapper/RCTSwiftUIWrapper.modulemap'
)

content = content.replace(
    '${PODS_CONFIGURATION_BUILD_DIR}/RCTTypeSafety/RCTTypeSafety.modulemap',
    '${PODS_ROOT}/Headers/Public/RCTTypeSafety/RCTTypeSafety.modulemap'
)

content = content.replace(
    '${PODS_CONFIGURATION_BUILD_DIR}/RCTDeprecation/RCTDeprecation.modulemap',
    '${PODS_ROOT}/Headers/Public/RCTDeprecation/RCTDeprecation.modulemap'
)

# Fix react-native-bisetka-photosphere modulemap path
content = content.replace(
    '${PODS_CONFIGURATION_BUILD_DIR}/react-native-bisetka-photosphere/react_native_bisetka_photosphere.modulemap',
    '${PODS_ROOT}/Headers/Public/react_native_bisetka_photosphere/react-native-bisetka-photosphere.modulemap'
)

# Write the file
with open(xcconfig_file, "w") as f:
    f.write(content)

print(f"Fixed: {xcconfig_file}")
