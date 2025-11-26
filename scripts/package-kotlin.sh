#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOTLIN_DIR="$PROJECT_ROOT/kotlin"
DIST_DIR="$KOTLIN_DIR/dist"

echo "📦 Packaging Kotlin bindings"

# Build bindings and native libs (host + Android if Docker available)
SKIP_ANDROID=${SKIP_ANDROID:-0} "$SCRIPT_DIR/build-kotlin.sh"

VERSION=$(cargo metadata --no-deps --format-version 1 \
  | jq -r '.packages[] | select(.name=="idkit-uniffi") | .version')

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
