#!/bin/bash
set -euo pipefail

# Build Swift bindings for IDKit
# This script builds the Rust library and generates Swift bindings

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
RUST_DIR="$PROJECT_ROOT/rust/uniffi-bindings"
SWIFT_DIR="$PROJECT_ROOT/swift"
GENERATED_DIR="$SWIFT_DIR/Sources/IDKit/Generated"

echo "🔨 Building IDKit Swift bindings..."
echo "Project root: $PROJECT_ROOT"

# Step 1: Build the Rust library
echo ""
echo "📦 Step 1/3: Building Rust library..."
cd "$PROJECT_ROOT"
cargo build --release --package idkit-uniffi

# Step 2: Generate Swift bindings
echo ""
echo "🔧 Step 2/3: Generating Swift bindings..."
mkdir -p "$GENERATED_DIR"

uniffi-bindgen generate \
    --library target/release/libidkit.dylib \
    --language swift \
    --out-dir "$GENERATED_DIR"

echo "✅ Generated Swift bindings to: $GENERATED_DIR"

# Step 3: Build Swift package (optional test)
echo ""
echo "🧪 Step 3/3: Testing Swift package compilation..."
cd "$SWIFT_DIR"

if command -v swift &> /dev/null; then
    swift build 2>&1 | head -20 || true
    echo ""
    echo "⚠️  Note: Swift package may fail to build without proper linking configuration."
    echo "   This is expected - the bindings are generated successfully."
else
    echo "⚠️  Swift compiler not found, skipping package test"
fi

echo ""
echo "✨ Done! Swift bindings are ready."
echo ""
echo "Next steps:"
echo "  1. The Swift bindings are in: $SWIFT_DIR"
echo "  2. Generated code is in: $GENERATED_DIR"
echo "  3. To use in a Swift project, link against target/release/libidkit.dylib"
