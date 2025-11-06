#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SWIFT_DIR="$PROJECT_ROOT/swift"
GENERATED_DIR="$SWIFT_DIR/Sources/IDKit/Generated"
IOS_BUILD="$PROJECT_ROOT/ios_build"

echo "📦 Packaging IDKit Swift artifacts"

rm -rf "$IOS_BUILD" "$PROJECT_ROOT/IDKitFFI.xcframework"
mkdir -p "$IOS_BUILD/bindings" \
         "$IOS_BUILD/Headers/IDKit" \
         "$IOS_BUILD/target/universal-ios-sim/release" \
         "$GENERATED_DIR"

export IPHONEOS_DEPLOYMENT_TARGET="13.0"
export RUSTFLAGS="-C link-arg=-Wl,-application_extension \
                  -C link-arg=-Wl,-dead_strip \
                  -C link-arg=-Wl,-dead_strip_dylibs \
                  -C embed-bitcode=no"

cd "$PROJECT_ROOT"

rustup target add aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-ios >/dev/null

echo "🔧 Building Rust library for Apple targets"
cargo build --package idkit-uniffi --target aarch64-apple-ios-sim --release --locked
cargo build --package idkit-uniffi --target x86_64-apple-ios --release --locked
cargo build --package idkit-uniffi --target aarch64-apple-ios --release --locked

strip -S -x target/aarch64-apple-ios/release/libidkit.a
strip -S -x target/x86_64-apple-ios/release/libidkit.a
strip -S -x target/aarch64-apple-ios-sim/release/libidkit.a || true

lipo -create \
  target/aarch64-apple-ios-sim/release/libidkit.a \
  target/x86_64-apple-ios/release/libidkit.a \
  -output $IOS_BUILD/target/universal-ios-sim/release/libidkit.a

lipo -info $IOS_BUILD/target/universal-ios-sim/release/libidkit.a

echo "🧬 Generating UniFFI Swift bindings"
uniffi-bindgen generate \
    --library target/aarch64-apple-ios-sim/release/libidkit.dylib \
    --language swift \
    --no-format \
    --out-dir "$IOS_BUILD/bindings"

rm -f "$GENERATED_DIR"/*
cp "$IOS_BUILD/bindings"/idkit.swift "$GENERATED_DIR/"
cp "$IOS_BUILD/bindings"/idkit_core.swift "$GENERATED_DIR/"
cp "$IOS_BUILD/bindings"/idkitFFI.h "$GENERATED_DIR/"
cp "$IOS_BUILD/bindings"/idkitFFI.modulemap "$GENERATED_DIR/"
cp "$IOS_BUILD/bindings"/idkit_coreFFI.h "$GENERATED_DIR/"
cp "$IOS_BUILD/bindings"/idkit_coreFFI.modulemap "$GENERATED_DIR/"

cp "$IOS_BUILD/bindings"/idkitFFI.h "$IOS_BUILD/Headers/IDKit/"
cp "$IOS_BUILD/bindings"/idkit_coreFFI.h "$IOS_BUILD/Headers/IDKit/"
cat "$IOS_BUILD/bindings"/idkitFFI.modulemap > "$IOS_BUILD/Headers/IDKit/module.modulemap"
cat "$IOS_BUILD/bindings"/idkit_coreFFI.modulemap >> "$IOS_BUILD/Headers/IDKit/module.modulemap"

echo "🏗️  Creating XCFramework"
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libidkit.a \
  -headers "$IOS_BUILD/Headers" \
  -library "$IOS_BUILD/target/universal-ios-sim/release/libidkit.a" \
  -headers "$IOS_BUILD/Headers" \
  -output "$PROJECT_ROOT/IDKitFFI.xcframework"

rm -rf "$IOS_BUILD"

echo "✨ Swift artifacts ready"
