#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
IDKIT_SWIFT_PATH="${1:-../idkit-swift}"

echo "🔧 Setting up local Swift development environment"

# Build the Swift artifacts
echo "📦 Building IDKit Swift artifacts..."
bash "$SCRIPT_DIR/package-swift.sh"

# Update idkit-swift Package.swift to point to local path
IDKIT_SWIFT_ABS_PATH="$(cd "$IDKIT_SWIFT_PATH" && pwd)"

echo "📝 Updating $IDKIT_SWIFT_ABS_PATH/Package.swift to use local development path..."

# Backup original Package.swift if it's not already backed up
if [ ! -f "$IDKIT_SWIFT_ABS_PATH/Package.swift.backup" ]; then
    cp "$IDKIT_SWIFT_ABS_PATH/Package.swift" "$IDKIT_SWIFT_ABS_PATH/Package.swift.backup"
    echo "   Backed up original Package.swift to Package.swift.backup"
fi

# Copy the generated sources to idkit-swift
rm -rf "$IDKIT_SWIFT_ABS_PATH/Sources/IDKit"
mkdir -p "$IDKIT_SWIFT_ABS_PATH/Sources/IDKit"
cp -R "$PROJECT_ROOT/swift/Sources/IDKit/"* "$IDKIT_SWIFT_ABS_PATH/Sources/IDKit/"

# Create or update Package.swift for local development
cat > "$IDKIT_SWIFT_ABS_PATH/Package.swift" <<'EOF'
// swift-tools-version: 5.10
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "IDKit",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "IDKit",
            targets: ["IDKit", "idkitFFI"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "IDKit",
            dependencies: ["idkitFFI"],
            path: "Sources/IDKit",
            exclude: [
                "Generated/idkitFFI.h",
                "Generated/idkitFFI.modulemap",
                "Generated/idkit_coreFFI.h",
                "Generated/idkit_coreFFI.modulemap"
            ]
        ),
        .binaryTarget(
            name: "idkitFFI",
            path: "../idkit/IDKitFFI.xcframework"
        )
    ]
)
// LOCAL DEVELOPMENT MODE - Points to ../idkit/IDKitFFI.xcframework
EOF

echo "✨ Local development setup complete!"
echo ""
echo "The idkit-swift package now points to the local XCFramework at:"
echo "  $PROJECT_ROOT/IDKitFFI.xcframework"
echo ""
echo "To rebuild after making changes to Rust code:"
echo "  cd $PROJECT_ROOT"
echo "  ./scripts/package-swift.sh"
echo ""
echo "Then rebuild your Swift project that depends on idkit-swift."
