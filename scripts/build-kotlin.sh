#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOTLIN_DIR="$PROJECT_ROOT/kotlin"
OUT_DIR="$KOTLIN_DIR/bindings/src/main/kotlin"
JNI_DIR="$KOTLIN_DIR/bindings/src/main/jniLibs"

echo "📦 Building Kotlin bindings from UniFFI"

mkdir -p "$OUT_DIR"

SYSTEM=$(uname -s)
LIB_EXT="so"
case "$SYSTEM" in
  Darwin) LIB_EXT="dylib" ;;
  MINGW*|MSYS*|CYGWIN*) LIB_EXT="dll" ;;
esac

HOST_LIB="$PROJECT_ROOT/target/release/libidkit.$LIB_EXT"

echo "🔧 Building Rust library (host) for binding generation"
CARGO_PROFILE_RELEASE_STRIP=none cargo build --package idkit-core --release --locked --features uniffi-bindings

echo "🧬 Generating Kotlin bindings"
CARGO_PROFILE_RELEASE_STRIP=none cargo run -p uniffi-bindgen generate \
  --library "$HOST_LIB" \
  --language kotlin \
  --no-format \
  --out-dir "$OUT_DIR"

if [ -n "${CI:-}" ]; then
  echo "🧹 Cleaning host build artifacts to free disk space for Android builds"
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
ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=4096"

DOCKER_READY=0
check_docker_ready() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout 10 docker info >/dev/null 2>&1
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout 10 docker info >/dev/null 2>&1
    return $?
  fi

  # Fallback when timeout utilities are unavailable.
  docker info >/dev/null 2>&1 &
  local docker_pid=$!
  local waited=0
  local max_wait=10

  while kill -0 "$docker_pid" >/dev/null 2>&1; do
    if [ "$waited" -ge "$max_wait" ]; then
      kill "$docker_pid" >/dev/null 2>&1 || true
      wait "$docker_pid" 2>/dev/null || true
      return 1
    fi

    sleep 1
    waited=$((waited + 1))
  done

  wait "$docker_pid"
}

if check_docker_ready; then
  DOCKER_READY=1
fi

if [[ "${SKIP_ANDROID:-0}" == "1" ]]; then
  echo "⚠️  SKIP_ANDROID=1 set; skipping Android cross builds."
else
  if [[ "$DOCKER_READY" == "1" ]]; then
    if ! command -v cross >/dev/null 2>&1; then
      echo "⏳ Installing cross (for Android targets)"
      cargo install cross --git https://github.com/cross-rs/cross --locked
    fi

    for entry in "${TARGETS[@]}"; do
      IFS=":" read -r TARGET ABI <<< "$entry"
      echo "  • $TARGET -> $ABI"
      RUSTFLAGS="$ANDROID_RUSTFLAGS" CROSS_NO_WARNINGS=1 cross build --package idkit-core --target "$TARGET" --profile android-release --locked --features uniffi-bindings
      mkdir -p "$JNI_DIR/$ABI"
      cp "$PROJECT_ROOT/target/$TARGET/android-release/libidkit.so" "$JNI_DIR/$ABI/libidkit.so"
      # Clean up Docker resources to save disk space during multi-target builds (CI only)
      if [ -n "${CI:-}" ] && command -v docker >/dev/null 2>&1; then
        echo "  ↳ Cleaning Docker resources after $TARGET build..."
        docker system prune -f >/dev/null 2>&1 || true
      fi
    done
  elif command -v cargo-ndk >/dev/null 2>&1; then
    echo "⚠️  Docker unavailable; falling back to local cargo-ndk Android builds."
    RUSTFLAGS="$ANDROID_RUSTFLAGS" cargo ndk \
      -t arm64-v8a \
      -t armeabi-v7a \
      -t x86 \
      -t x86_64 \
      -o "$JNI_DIR" \
      --manifest-path "$PROJECT_ROOT/rust/core/Cargo.toml" \
      build --profile android-release --features uniffi-bindings
  else
    echo "⚠️  Docker and cargo-ndk are unavailable; skipping Android cross builds. Set SKIP_ANDROID=1 to silence."
  fi
fi

echo "✅ Kotlin bindings ready in $OUT_DIR with jniLibs under $JNI_DIR"
