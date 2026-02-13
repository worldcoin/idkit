#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOTLIN_DIR="$PROJECT_ROOT/kotlin"
DIST_DIR="$KOTLIN_DIR/dist"

echo "📦 Packaging Kotlin bindings"

# Build bindings and native libs (host + Android if Docker available)
SKIP_ANDROID=${SKIP_ANDROID:-0} "$SCRIPT_DIR/build-kotlin.sh"

VERSION=$(grep '^version=' "$KOTLIN_DIR/gradle.properties" | cut -d= -f2- | tr -d '[:space:]')
if [ -z "$VERSION" ]; then
  echo "❌ Failed to resolve version from kotlin/gradle.properties"
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "🗜️  Zipping bindings (version $VERSION)"
(
  cd "$KOTLIN_DIR"
  zip -r "dist/idkit-kotlin-${VERSION}.zip" bindings > /dev/null
)

echo "✅ Kotlin package ready: $DIST_DIR/idkit-kotlin-${VERSION}.zip"
echo "sha256:"
shasum -a 256 "$DIST_DIR/idkit-kotlin-${VERSION}.zip"
