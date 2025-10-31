#!/bin/bash
set -e

echo "Building IDKit for Kotlin..."

cd "$(dirname "$0")/.."

# Build the Rust library for Android targets
echo "Building Rust library for Android..."
cargo build --package idkit-uniffi --release --target aarch64-linux-android
cargo build --package idkit-uniffi --release --target armv7-linux-androideabi
cargo build --package idkit-uniffi --release --target i686-linux-android
cargo build --package idkit-uniffi --release --target x86_64-linux-android

# Build for JVM (host platform)
cargo build --package idkit-uniffi --release

# Generate Kotlin bindings
echo "Generating Kotlin bindings..."
cargo run --bin uniffi-bindgen generate \
    --library ./target/release/libidkit.so \
    --language kotlin \
    --out-dir ./kotlin/idkit/src/commonMain/kotlin

# Copy native libraries to Android jniLibs
echo "Copying native libraries..."
mkdir -p ./kotlin/idkit/src/androidMain/jniLibs/{arm64-v8a,armeabi-v7a,x86,x86_64}

cp ./target/aarch64-linux-android/release/libidkit.so \
   ./kotlin/idkit/src/androidMain/jniLibs/arm64-v8a/

cp ./target/armv7-linux-androideabi/release/libidkit.so \
   ./kotlin/idkit/src/androidMain/jniLibs/armeabi-v7a/

cp ./target/i686-linux-android/release/libidkit.so \
   ./kotlin/idkit/src/androidMain/jniLibs/x86/

cp ./target/x86_64-linux-android/release/libidkit.so \
   ./kotlin/idkit/src/androidMain/jniLibs/x86_64/

echo "Kotlin build complete!"
