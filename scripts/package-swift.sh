#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SWIFT_DIR="$PROJECT_ROOT/swift"
GENERATED_DIR="$SWIFT_DIR/Sources/IDKit/Generated"
IOS_BUILD="$PROJECT_ROOT/ios_build"
FFI_INCLUDE_DIR="$SWIFT_DIR/Sources/idkitFFI/include"

echo "📦 Packaging IDKit Swift artifacts"

rm -rf "$IOS_BUILD" "$PROJECT_ROOT/IDKitFFI.xcframework"
mkdir -p "$FFI_INCLUDE_DIR"
mkdir -p "$IOS_BUILD/bindings" \
         "$IOS_BUILD/Headers/IDKit" \
         "$IOS_BUILD/target/universal-ios-sim/release" \
         "$IOS_BUILD/target/universal-macos/release" \
         "$GENERATED_DIR"

export IPHONEOS_DEPLOYMENT_TARGET="13.0"
export MACOSX_DEPLOYMENT_TARGET="12.0"
export RUSTFLAGS="-C link-arg=-Wl,-application_extension \
                  -C link-arg=-Wl,-dead_strip \
                  -C link-arg=-Wl,-dead_strip_dylibs"

cd "$PROJECT_ROOT"

rustup target add aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-ios aarch64-apple-darwin x86_64-apple-darwin >/dev/null

echo "🔧 Building Rust library for Apple targets"
cargo build --package idkit-core --target aarch64-apple-ios-sim --release --locked --features uniffi-bindings
cargo build --package idkit-core --target x86_64-apple-ios --release --locked --features uniffi-bindings
cargo build --package idkit-core --target aarch64-apple-ios --release --locked --features uniffi-bindings
cargo build --package idkit-core --target aarch64-apple-darwin --release --locked --features uniffi-bindings
cargo build --package idkit-core --target x86_64-apple-darwin --release --locked --features uniffi-bindings

cp target/aarch64-apple-ios/release/libidkit.a target/aarch64-apple-ios/release/libidkitFFI.a
cp target/x86_64-apple-ios/release/libidkit.a target/x86_64-apple-ios/release/libidkitFFI.a
cp target/aarch64-apple-ios-sim/release/libidkit.a target/aarch64-apple-ios-sim/release/libidkitFFI.a
cp target/aarch64-apple-darwin/release/libidkit.a target/aarch64-apple-darwin/release/libidkitFFI.a
cp target/x86_64-apple-darwin/release/libidkit.a target/x86_64-apple-darwin/release/libidkitFFI.a

strip -S -x target/aarch64-apple-ios/release/libidkitFFI.a
strip -S -x target/x86_64-apple-ios/release/libidkitFFI.a
strip -S -x target/aarch64-apple-ios-sim/release/libidkitFFI.a || true
strip -S -x target/aarch64-apple-darwin/release/libidkitFFI.a || true
strip -S -x target/x86_64-apple-darwin/release/libidkitFFI.a || true

lipo -create \
  target/aarch64-apple-ios-sim/release/libidkitFFI.a \
  target/x86_64-apple-ios/release/libidkitFFI.a \
  -output $IOS_BUILD/target/universal-ios-sim/release/libidkitFFI.a

lipo -create \
  target/aarch64-apple-darwin/release/libidkitFFI.a \
  target/x86_64-apple-darwin/release/libidkitFFI.a \
  -output $IOS_BUILD/target/universal-macos/release/libidkitFFI.a

lipo -info $IOS_BUILD/target/universal-ios-sim/release/libidkitFFI.a
lipo -info $IOS_BUILD/target/universal-macos/release/libidkitFFI.a

echo "🧬 Generating UniFFI Swift bindings"
cargo run -p uniffi-bindgen generate \
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

rm -f "$FFI_INCLUDE_DIR"/idkitFFI.h "$FFI_INCLUDE_DIR"/idkit_coreFFI.h "$FFI_INCLUDE_DIR"/module.modulemap
cp "$IOS_BUILD/bindings"/idkitFFI.h "$FFI_INCLUDE_DIR/"
cp "$IOS_BUILD/bindings"/idkit_coreFFI.h "$FFI_INCLUDE_DIR/"
cat <<'EOF' > "$FFI_INCLUDE_DIR/module.modulemap"
module idkitFFI {
    header "idkitFFI.h"
    header "idkit_coreFFI.h"
    export *
}
EOF

cp "$IOS_BUILD/bindings"/idkitFFI.h "$IOS_BUILD/Headers/IDKit/"
cp "$IOS_BUILD/bindings"/idkit_coreFFI.h "$IOS_BUILD/Headers/IDKit/"
cat "$IOS_BUILD/bindings"/idkitFFI.modulemap > "$IOS_BUILD/Headers/IDKit/module.modulemap"
cat "$IOS_BUILD/bindings"/idkit_coreFFI.modulemap >> "$IOS_BUILD/Headers/IDKit/module.modulemap"

echo "🏗️  Creating XCFramework"
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libidkitFFI.a \
  -headers "$IOS_BUILD/Headers" \
  -library "$IOS_BUILD/target/universal-ios-sim/release/libidkitFFI.a" \
  -headers "$IOS_BUILD/Headers" \
  -library "$IOS_BUILD/target/universal-macos/release/libidkitFFI.a" \
  -headers "$IOS_BUILD/Headers" \
  -output "$PROJECT_ROOT/IDKitFFI.xcframework"

if [ -f "$PROJECT_ROOT/IDKitFFI.xcframework/ios-arm64/libidkit.a" ]; then
  mv "$PROJECT_ROOT/IDKitFFI.xcframework/ios-arm64/libidkit.a" \
     "$PROJECT_ROOT/IDKitFFI.xcframework/ios-arm64/libidkitFFI.a"
fi
if [ -f "$PROJECT_ROOT/IDKitFFI.xcframework/ios-arm64_x86_64-simulator/libidkit.a" ]; then
  mv "$PROJECT_ROOT/IDKitFFI.xcframework/ios-arm64_x86_64-simulator/libidkit.a" \
     "$PROJECT_ROOT/IDKitFFI.xcframework/ios-arm64_x86_64-simulator/libidkitFFI.a"
fi

rm -rf "$IOS_BUILD"

echo "🔗 Creating symlink for local Swift package"
cd "$SWIFT_DIR"
rm -f IDKitFFI.xcframework
ln -s ../IDKitFFI.xcframework IDKitFFI.xcframework

echo "✨ Swift artifacts ready"
