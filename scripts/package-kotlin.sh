#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOTLIN_DIR="$PROJECT_ROOT/kotlin"
DIST_DIR="$KOTLIN_DIR/dist"

echo "📦 Packaging Kotlin SDK module"

# Build native libs (host + Android if Docker/cargo-ndk available + iOS on macOS)
SKIP_ANDROID=${SKIP_ANDROID:-0} "$SCRIPT_DIR/build-kotlin.sh"

VERSION=$(grep '^version=' "$KOTLIN_DIR/gradle.properties" | cut -d= -f2- | tr -d '[:space:]')
if [ -z "$VERSION" ]; then
  echo "❌ Failed to resolve version from kotlin/gradle.properties"
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "🗜️  Zipping SDK module (version $VERSION)"
(
  cd "$KOTLIN_DIR"
  zip -r "dist/idkit-kotlin-${VERSION}.zip" idkit -x "idkit/build/*" -x "idkit/.gradle/*" > /dev/null
)

echo "✅ Kotlin package ready: $DIST_DIR/idkit-kotlin-${VERSION}.zip"
echo "sha256:"
shasum -a 256 "$DIST_DIR/idkit-kotlin-${VERSION}.zip"
