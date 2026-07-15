#!/bin/bash
# Builds the native artifacts for the Kotlin Multiplatform SDK (kotlin/).
#
# Outputs:
#   - Host library        target/release/libidkit_kmp.{dylib,so}   (JVM unit tests via JNA)
#   - Android jniLibs     kotlin/idkit/src/androidMain/jniLibs/<abi>/libidkit_kmp.so
#   - iOS static libs     target/<triple>/release/libidkit_kmp.a   (Kotlin/Native cinterop)
#
# Env toggles: SKIP_ANDROID=1 skips Android cross builds, SKIP_IOS=1 skips iOS builds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JNI_DIR="$PROJECT_ROOT/kotlin/idkit/src/androidMain/jniLibs"

echo "📦 Building IDKit Kotlin native artifacts (rust/kmp-ffi)"

cd "$PROJECT_ROOT"

echo "🔧 Building host library (for JVM unit tests)"
cargo build --package idkit-kmp-ffi --release --locked

# ─────────────────────────────────────────────────────────────────────────────
# Android
# ─────────────────────────────────────────────────────────────────────────────
declare -a TARGETS=(
  "aarch64-linux-android:arm64-v8a"
  "armv7-linux-androideabi:armeabi-v7a"
  "x86_64-linux-android:x86_64"
  "i686-linux-android:x86"
)
# 16KB page-size alignment, mirrors Cross.toml
ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=4096"
# NOTE: Android builds use the kmp-android-release profile (panic=unwind) so the
# FFI layer's catch_unwind can convert panics into error envelopes instead of
# aborting the host app. Do NOT switch to android-release (panic=abort).
ANDROID_PROFILE="kmp-android-release"

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
  echo "🎯 Installing Android Rust targets"
  rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android >/dev/null

  echo "🤖 Building Android ABIs"
  mkdir -p "$JNI_DIR"
  if [[ "$DOCKER_READY" == "1" ]]; then
    if ! command -v cross >/dev/null 2>&1; then
      echo "⏳ Installing cross (for Android targets)"
      cargo install cross --git https://github.com/cross-rs/cross --locked
    fi

    for entry in "${TARGETS[@]}"; do
      IFS=":" read -r TARGET ABI <<< "$entry"
      echo "  • $TARGET -> $ABI"
      RUSTFLAGS="$ANDROID_RUSTFLAGS" CROSS_NO_WARNINGS=1 cross build --package idkit-kmp-ffi --target "$TARGET" --profile "$ANDROID_PROFILE" --locked
      mkdir -p "$JNI_DIR/$ABI"
      cp "$PROJECT_ROOT/target/$TARGET/$ANDROID_PROFILE/libidkit_kmp.so" "$JNI_DIR/$ABI/libidkit_kmp.so"
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
      --manifest-path "$PROJECT_ROOT/rust/kmp-ffi/Cargo.toml" \
      build --profile "$ANDROID_PROFILE"
    # cargo-ndk copies every cdylib it built, including idkit-core's own
    # libidkit.so (a build dependency). Only libidkit_kmp.so may ship in the
    # AAR — libidkit.so belongs to the UniFFI toolchain and would collide.
    find "$JNI_DIR" -name "libidkit.so" -delete
  else
    echo "⚠️  Docker and cargo-ndk are unavailable; skipping Android cross builds. Set SKIP_ANDROID=1 to silence."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# iOS (static libs consumed by Kotlin/Native cinterop; Darwin hosts only)
# ─────────────────────────────────────────────────────────────────────────────
if [[ "${SKIP_IOS:-0}" == "1" ]]; then
  echo "⚠️  SKIP_IOS=1 set; skipping iOS builds."
elif [[ "$(uname -s)" != "Darwin" ]]; then
  echo "⚠️  Not on macOS; skipping iOS builds."
else
  echo "🎯 Installing iOS Rust targets"
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios >/dev/null

  echo "🍎 Building iOS static libraries"
  export IPHONEOS_DEPLOYMENT_TARGET="13.0"
  for TARGET in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
    echo "  • $TARGET"
    cargo build --package idkit-kmp-ffi --target "$TARGET" --release --locked
  done
fi

echo "✅ Kotlin native artifacts ready:"
echo "   host:    $PROJECT_ROOT/target/release/libidkit_kmp.*"
if [[ "${SKIP_ANDROID:-0}" != "1" ]]; then
  echo "   android: $JNI_DIR/<abi>/libidkit_kmp.so"
fi
if [[ "${SKIP_IOS:-0}" != "1" && "$(uname -s)" == "Darwin" ]]; then
  echo "   ios:     $PROJECT_ROOT/target/<triple>/release/libidkit_kmp.a"
fi
