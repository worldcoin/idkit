# Testing Guide

This package includes comprehensive tests for IDKit core functionality.

## Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage
```

## Running WASM Tests

### Option 1: Browser Tests

Use the browser example to manually test WASM functionality:

```bash
cd examples/browser
python3 -m http.server 8000
```

Open http://localhost:8000 and check the browser console.

### Option 2: Node with WASM Polyfills

```bash
# Install polyfills for Node.js
pnpm add -D @peculiar/webcrypto node-fetch

# Update vitest config to include polyfills
# Then run: pnpm test --run wasm
```