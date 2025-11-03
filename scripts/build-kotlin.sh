#!/bin/bash
set -e

echo "Building IDKit for Kotlin/Android..."

cd "$(dirname "$0")/.."

# Build for host platform first for binding generation
echo "Building Rust library for host platform..."
cargo build --package idkit-uniffi --release

# Determine host library extension
if [[ "$OSTYPE" == "darwin"* ]]; then
    LIB_EXT="dylib"
else
    LIB_EXT="so"
fi

# Generate Kotlin bindings (following WalletKit pattern - output to java/)
echo "Generating Kotlin bindings..."
uniffi-bindgen generate \
    --library ./target/release/libidkit.${LIB_EXT} \
    --language kotlin \
    --no-format \
    --out-dir ./kotlin/lib/src/main/java

# Build the Rust library for Android targets
echo "Building Rust library for Android targets..."
cargo build --package idkit-uniffi --release --target aarch64-linux-android
cargo build --package idkit-uniffi --release --target armv7-linux-androideabi
cargo build --package idkit-uniffi --release --target i686-linux-android
cargo build --package idkit-uniffi --release --target x86_64-linux-android

# Copy native libraries to Android jniLibs (following WalletKit pattern)
echo "Copying native libraries to jniLibs..."
mkdir -p ./kotlin/lib/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86,x86_64}

cp ./target/aarch64-linux-android/release/libidkit.so \
   ./kotlin/lib/src/main/jniLibs/arm64-v8a/

cp ./target/armv7-linux-androideabi/release/libidkit.so \
   ./kotlin/lib/src/main/jniLibs/armeabi-v7a/

cp ./target/i686-linux-android/release/libidkit.so \
   ./kotlin/lib/src/main/jniLibs/x86/

cp ./target/x86_64-linux-android/release/libidkit.so \
   ./kotlin/lib/src/main/jniLibs/x86_64/

echo "✅ Kotlin build complete!"
echo ""
echo "Generated files:"
echo "  - Kotlin bindings: kotlin/lib/src/main/java/uniffi/"
echo "  - Android JNI libs: kotlin/lib/src/main/jniLibs/"
