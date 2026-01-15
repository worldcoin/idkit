#!/bin/bash
#
# Build script for IDKit WASM bindings
#
# This script compiles the Rust WASM bindings using wasm-pack and outputs
# the generated files to the JavaScript packages directory.
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building IDKit WASM bindings...${NC}"

# Get the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Paths
CORE_CRATE="$PROJECT_ROOT/rust/core"
OUTPUT_DIR="$PROJECT_ROOT/js/packages/core/wasm"

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo -e "${RED}Error: wasm-pack is not installed${NC}"
    echo "Install it with: cargo install wasm-pack"
    exit 1
fi

# Check if the core crate exists
if [ ! -d "$CORE_CRATE" ]; then
    echo -e "${RED}Error: Core crate not found at $CORE_CRATE${NC}"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo -e "${YELLOW}Compiling Rust to WASM...${NC}"

# Build with wasm-pack
# --target web: Generate ES modules for use in browsers
# --out-dir: Output directory for generated files
# --out-name: Name of the generated WASM file (default: package name)
# --features wasm-bindings: Enable WASM bindings in idkit-core
cd "$CORE_CRATE"
wasm-pack build \
    --target web \
    --out-dir "$OUTPUT_DIR" \
    --out-name idkit_wasm \
    --release \
    -- --features wasm-bindings

# wasm-pack generates a package.json and .gitignore we don't need
echo -e "${YELLOW}Cleaning up unnecessary files...${NC}"
rm -f "$OUTPUT_DIR/package.json"
rm -f "$OUTPUT_DIR/.gitignore"

echo -e "${GREEN}✓ WASM build complete!${NC}"
echo -e "Generated files:"
echo -e "  - ${YELLOW}$OUTPUT_DIR/idkit_wasm.js${NC} (WASM loader)"
echo -e "  - ${YELLOW}$OUTPUT_DIR/idkit_wasm_bg.wasm${NC} (WASM binary)"
echo -e "  - ${YELLOW}$OUTPUT_DIR/idkit_wasm.d.ts${NC} (TypeScript definitions)"
echo -e "  - ${YELLOW}$OUTPUT_DIR/idkit_wasm_bg.wasm.d.ts${NC} (WASM type definitions)"

# Show bundle size
if [ -f "$OUTPUT_DIR/idkit_wasm_bg.wasm" ]; then
    WASM_SIZE=$(wc -c < "$OUTPUT_DIR/idkit_wasm_bg.wasm" | tr -d ' ')
    WASM_SIZE_KB=$((WASM_SIZE / 1024))
    echo -e "\n${GREEN}WASM bundle size: ${WASM_SIZE_KB}KB${NC}"
fi

echo -e "\n${GREEN}Build successful!${NC}"
