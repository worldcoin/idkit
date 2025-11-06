#!/bin/bash
set -euo pipefail

IDKIT_SWIFT_PATH="${1:-../idkit-swift}"
IDKIT_SWIFT_ABS_PATH="$(cd "$IDKIT_SWIFT_PATH" && pwd)"

echo "🔄 Restoring idkit-swift to original state..."

# Restore Package.swift from backup
if [ -f "$IDKIT_SWIFT_ABS_PATH/Package.swift.backup" ]; then
    mv "$IDKIT_SWIFT_ABS_PATH/Package.swift.backup" "$IDKIT_SWIFT_ABS_PATH/Package.swift"
    echo "   ✅ Restored Package.swift"
else
    echo "   ⚠️  No Package.swift.backup found"
fi

# Reset git changes in idkit-swift
cd "$IDKIT_SWIFT_ABS_PATH"
echo "   Resetting git changes..."
git restore .
git clean -fd

echo "✨ idkit-swift restored to original state"
