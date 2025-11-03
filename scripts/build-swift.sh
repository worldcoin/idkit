#!/bin/bash
set -e

# Creates a Swift build of the IDKit library (following WalletKit pattern)
echo "Building IDKit.xcframework"

BASE_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clean up previous builds
rm -rf $BASE_PATH/ios_build
rm -rf $BASE_PATH/swift/IDKitFFI.xcframework
mkdir -p $BASE_PATH/ios_build/bindings
mkdir -p $BASE_PATH/ios_build/target/universal-ios-sim/release
mkdir -p $BASE_PATH/swift/Sources/IDKit

# Set deployment target
export IPHONEOS_DEPLOYMENT_TARGET="13.0"

# Build Rust library for all Apple targets
echo "Building Rust library for Apple platforms..."
cargo build --package idkit-uniffi --target aarch64-apple-ios-sim --release
cargo build --package idkit-uniffi --target aarch64-apple-ios --release
cargo build --package idkit-uniffi --target x86_64-apple-ios --release

echo "Combining iOS simulator binaries..."

# Combine simulator architectures into universal binary
lipo -create \
  target/aarch64-apple-ios-sim/release/libidkit.a \
  target/x86_64-apple-ios/release/libidkit.a \
  -output $BASE_PATH/ios_build/target/universal-ios-sim/release/libidkit.a

lipo -info $BASE_PATH/ios_build/target/universal-ios-sim/release/libidkit.a

# Generate Swift bindings (following WalletKit pattern)
echo "Generating Swift bindings..."

cargo run -p uniffi-bindgen generate \
  target/aarch64-apple-ios-sim/release/libidkit.dylib \
  --library \
  --language swift \
  --no-format \
  --out-dir $BASE_PATH/ios_build/bindings

# Move Swift source to final location
mv $BASE_PATH/ios_build/bindings/idkit.swift $BASE_PATH/swift/Sources/IDKit/
mv $BASE_PATH/ios_build/bindings/idkit_core.swift $BASE_PATH/swift/Sources/IDKit/

# Set up headers directory
mkdir $BASE_PATH/ios_build/Headers
mkdir -p $BASE_PATH/ios_build/Headers/IDKit

# Move headers and module maps
mv $BASE_PATH/ios_build/bindings/idkitFFI.h $BASE_PATH/ios_build/Headers/IDKit
mv $BASE_PATH/ios_build/bindings/idkit_coreFFI.h $BASE_PATH/ios_build/Headers/IDKit

cat $BASE_PATH/ios_build/bindings/idkitFFI.modulemap > $BASE_PATH/ios_build/Headers/IDKit/module.modulemap
cat $BASE_PATH/ios_build/bindings/idkit_coreFFI.modulemap >> $BASE_PATH/ios_build/Headers/IDKit/module.modulemap

# Create XCFramework
echo "Creating xcframework..."

xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libidkit.a -headers $BASE_PATH/ios_build/Headers \
  -library $BASE_PATH/ios_build/target/universal-ios-sim/release/libidkit.a -headers $BASE_PATH/ios_build/Headers \
  -output $BASE_PATH/swift/IDKitFFI.xcframework

# Clean up temporary build directory
rm -rf $BASE_PATH/ios_build

echo "✅ Swift build complete!"
echo ""
echo "Generated files:"
echo "  - Swift bindings: swift/Sources/IDKit/"
echo "  - XCFramework: swift/IDKitFFI.xcframework"
