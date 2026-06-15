#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/TradePad"
SCHEME="TradePad"
WORKSPACE="${PROJECT_DIR}/TradePad.xcworkspace"
SIMULATOR_NAME="iPhone 16"
BUNDLE_ID="com.buildlogg.app"

echo "=== Buildlogg iOS Build & Launch ==="

# Step 1: Generate project with Tuist if needed
cd "${PROJECT_DIR}"
if [ ! -f "TradePad.xcodeproj/project.pbxproj" ] || [ -f "Project.swift" ]; then
    echo "[1/4] Generating Xcode project with Tuist..."
    tuist generate
else
    echo "[1/4] Xcode project already exists, skipping Tuist generate"
fi

# Step 2: Find or create simulator
echo "[2/4] Finding iOS Simulator..."
DEVICE_ID=$(xcrun simctl list devices available | grep "${SIMULATOR_NAME}" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)

if [ -z "${DEVICE_ID}" ]; then
    echo "Creating simulator: ${SIMULATOR_NAME}..."
    RUNTIME_ID=$(xcrun simctl list runtimes | grep "iOS" | head -1 | grep -oE 'com.apple.CoreSimulator.SimRuntime.iOS-[0-9]+-[0-9]+' || true)
    if [ -z "${RUNTIME_ID}" ]; then
        echo "No iOS runtime found. Attempting to download..."
        xcodebuild -downloadPlatform iOS
        RUNTIME_ID=$(xcrun simctl list runtimes | grep "iOS" | head -1 | grep -oE 'com.apple.CoreSimulator.SimRuntime.iOS-[0-9]+-[0-9]+')
    fi
    DEVICE_ID=$(xcrun simctl create "${SIMULATOR_NAME}" com.apple.CoreSimulator.SimDeviceType.iPhone-16 "${RUNTIME_ID}")
fi

echo "Using simulator: ${DEVICE_ID}"

# Step 3: Build
echo "[3/4] Building for iOS Simulator..."
xcodebuild -workspace "${WORKSPACE}" \
    -scheme "${SCHEME}" \
    -destination "platform=iOS Simulator,id=${DEVICE_ID}" \
    -configuration Debug \
    build

# Step 4: Install and launch
echo "[4/4] Installing and launching on simulator..."
xcrun simctl boot "${DEVICE_ID}" 2>/dev/null || true

APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name 'TradePad.app' -path "*iphonesimulator*" -not -path "*Index*" | head -1)
if [ -z "${APP_PATH}" ]; then
    echo "ERROR: Could not find built app in DerivedData"
    exit 1
fi

xcrun simctl install "${DEVICE_ID}" "${APP_PATH}"
xcrun simctl launch "${DEVICE_ID}" "${BUNDLE_ID}"

echo "=== Build & Launch Complete ==="
