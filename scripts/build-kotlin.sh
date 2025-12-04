#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOTLIN_DIR="$PROJECT_ROOT/kotlin"
OUT_DIR="$KOTLIN_DIR/bindings/src/main/kotlin"
RES_DIR="$KOTLIN_DIR/bindings/src/main/resources"
JNI_DIR="$KOTLIN_DIR/bindings/src/main/jniLibs"

echo "📦 Building Kotlin bindings from UniFFI"

mkdir -p "$OUT_DIR" "$RES_DIR"

SYSTEM=$(uname -s)
LIB_EXT="so"
case "$SYSTEM" in
  Darwin) LIB_EXT="dylib" ;;
  MINGW*|MSYS*|CYGWIN*) LIB_EXT="dll" ;;
esac

HOST_LIB="$PROJECT_ROOT/target/release/libidkit.$LIB_EXT"

echo "🔧 Building Rust library (host) for binding generation"
cargo build --package idkit-uniffi --release --locked

echo "🧬 Generating Kotlin bindings"
cargo run -p uniffi-bindgen generate \
  --library "$HOST_LIB" \
  --language kotlin \
  --no-format \
  --out-dir "$OUT_DIR"

echo "📁 Copying host native library into resources for JVM loading"
mkdir -p "$RES_DIR"
cp "$HOST_LIB" "$RES_DIR/"

echo "🧹 Cleaning host build artifacts to free disk space for Android builds"
# Keep the final library in resources, but clean the target directory
if [ -f "$RES_DIR/$(basename "$HOST_LIB")" ]; then
  cargo clean --package idkit-uniffi --release || true
  cargo clean --package idkit-core --release || true
  rm -rf ~/.cargo/registry/cache || true
fi

echo "🤖 Building Android ABIs"
mkdir -p "$JNI_DIR"
declare -a TARGETS=(
  "aarch64-linux-android:arm64-v8a"
  "armv7-linux-androideabi:armeabi-v7a"
  "x86_64-linux-android:x86_64"
  "i686-linux-android:x86"
)

if [[ "${SKIP_ANDROID:-0}" == "1" ]]; then
  echo "⚠️  SKIP_ANDROID=1 set; skipping Android cross builds."
else
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo "⚠️  Docker unavailable; skipping Android cross builds. Set SKIP_ANDROID=1 to silence."
  else
    if ! command -v cross >/dev/null 2>&1; then
      echo "⏳ Installing cross (for Android targets)"
      cargo install cross --git https://github.com/cross-rs/cross --locked
    fi

    for entry in "${TARGETS[@]}"; do
      IFS=":" read -r TARGET ABI <<< "$entry"
      echo "  • $TARGET -> $ABI"
      CROSS_NO_WARNINGS=1 cross build --package idkit-uniffi --target "$TARGET" --release --locked
      mkdir -p "$JNI_DIR/$ABI"
      cp "$PROJECT_ROOT/target/$TARGET/release/libidkit.so" "$JNI_DIR/$ABI/libidkit.so"
      # Clean up Docker resources to save disk space during multi-target builds
      if command -v docker >/dev/null 2>&1; then
        echo "  ↳ Cleaning Docker resources after $TARGET build..."
        docker system prune -f >/dev/null 2>&1 || true
      fi
    done
  fi
fi

echo "✅ Kotlin bindings ready in $OUT_DIR with jniLibs under $JNI_DIR"
