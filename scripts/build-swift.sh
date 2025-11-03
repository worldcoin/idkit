#!/bin/bash
set -e

echo "Building IDKit for Swift..."

# Build the Rust library for all targets
echo "Building Rust library..."
cd "$(dirname "$0")/.."

# macOS targets (for development)
echo "Building for macOS..."
cargo build --package idkit-uniffi --release --target aarch64-apple-darwin
cargo build --package idkit-uniffi --release --target x86_64-apple-darwin

# iOS targets
echo "Building for iOS..."
cargo build --package idkit-uniffi --release --target aarch64-apple-ios
cargo build --package idkit-uniffi --release --target x86_64-apple-ios
cargo build --package idkit-uniffi --release --target aarch64-apple-ios-sim

# Generate Swift bindings using uniffi-bindgen CLI (with proc macros)
echo "Generating Swift bindings..."
uniffi-bindgen generate \
    --library ./target/aarch64-apple-darwin/release/libidkit.dylib \
    --language swift \
    --out-dir ./swift/Sources/IDKit

# Create XCFramework
echo "Creating XCFramework..."
rm -rf ./swift/IDKitFFI.xcframework
mkdir -p ./swift/IDKitFFI.xcframework

# Create XCFramework with all architectures
xcodebuild -create-xcframework \
    -library ./target/aarch64-apple-ios/release/libidkit.a \
    -library ./target/aarch64-apple-ios-sim/release/libidkit.a \
    -library ./target/aarch64-apple-darwin/release/libidkit.dylib \
    -output ./swift/IDKitFFI.xcframework

echo "✅ Swift build complete!"
echo ""
echo "Generated files:"
echo "  - Swift bindings: swift/Sources/IDKit/"
echo "  - XCFramework: swift/IDKitFFI.xcframework"
