#!/bin/bash
set -e

echo "Building IDKit for Swift..."

# Build the Rust library for all targets
echo "Building Rust library..."
cd "$(dirname "$0")/.."

# iOS targets
cargo build --package idkit-uniffi --release --target aarch64-apple-ios
cargo build --package idkit-uniffi --release --target x86_64-apple-ios
cargo build --package idkit-uniffi --release --target aarch64-apple-ios-sim

# macOS targets
cargo build --package idkit-uniffi --release --target aarch64-apple-darwin
cargo build --package idkit-uniffi --release --target x86_64-apple-darwin

# Generate Swift bindings
echo "Generating Swift bindings..."
cargo run --bin uniffi-bindgen generate \
    --library ./target/aarch64-apple-darwin/release/libidkit.dylib \
    --language swift \
    --out-dir ./swift/Sources/IDKit/Generated

# Create XCFramework
echo "Creating XCFramework..."
mkdir -p ./swift/IDKitFFI.xcframework

# Create iOS framework
xcodebuild -create-xcframework \
    -library ./target/aarch64-apple-ios/release/libidkit.a \
    -library ./target/aarch64-apple-ios-sim/release/libidkit.a \
    -library ./target/aarch64-apple-darwin/release/libidkit.dylib \
    -output ./swift/IDKitFFI.xcframework

echo "Swift build complete!"
