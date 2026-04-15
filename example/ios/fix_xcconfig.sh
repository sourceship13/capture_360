#!/bin/bash

# Fix xcconfig files for static libraries
XCCONFIG_DEBUG="Pods/Target Support Files/Pods-Capture360Example/Pods-Capture360Example.debug.xcconfig"
XCCONFIG_RELEASE="Pods/Target Support Files/Pods-Capture360Example/Pods-Capture360Example.release.xcconfig"

# Fix modulemap paths in OTHER_CFLAGS and OTHER_SWIFT_FLAGS
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI/RCTSwiftUI.modulemap|${PODS_ROOT}/Headers/Public/RCTSwiftUI/RCTSwiftUI.modulemap|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper/RCTSwiftUIWrapper.modulemap|${PODS_ROOT}/Headers/Public/RCTSwiftUIWrapper/RCTSwiftUIWrapper.modulemap|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTTypeSafety/RCTTypeSafety.modulemap|${PODS_ROOT}/Headers/Public/RCTTypeSafety/RCTTypeSafety.modulemap|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTDeprecation/RCTDeprecation.modulemap|${PODS_ROOT}/Headers/Public/RCTDeprecation/RCTDeprecation.modulemap|g' "$XCCONFIG_DEBUG"

# Fix SWIFT_INCLUDE_PATHS
sed -i.bak 's|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI"|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper"|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_DEBUG"

# Fix OTHER_MODULE_VERIFIER_FLAGS
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTTypeSafety"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_DEBUG"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTDeprecation"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_DEBUG"

# Same for release
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI/RCTSwiftUI.modulemap|${PODS_ROOT}/Headers/Public/RCTSwiftUI/RCTSwiftUI.modulemap|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper/RCTSwiftUIWrapper.modulemap|${PODS_ROOT}/Headers/Public/RCTSwiftUIWrapper/RCTSwiftUIWrapper.modulemap|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTTypeSafety/RCTTypeSafety.modulemap|${PODS_ROOT}/Headers/Public/RCTTypeSafety/RCTTypeSafety.modulemap|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|${PODS_CONFIGURATION_BUILD_DIR}/RCTDeprecation/RCTDeprecation.modulemap|${PODS_ROOT}/Headers/Public/RCTDeprecation/RCTDeprecation.modulemap|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI"|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper"|SWIFT_INCLUDE_PATHS = $(inherited) "${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUIWrapper"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTTypeSafety"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_RELEASE"
sed -i.bak 's|"-F${PODS_CONFIGURATION_BUILD_DIR}/RCTDeprecation"|"-F${PODS_ROOT}/Headers/Public"|g' "$XCCONFIG_RELEASE"

echo "Fixed xcconfig files"
