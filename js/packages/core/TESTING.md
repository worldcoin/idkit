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

## Test Organization

```
src/__tests__/
├── types.test.ts       ✅ Type definitions and errors (7 tests)
├── utils.test.ts       🔄 Crypto utilities (requires WASM)
├── session.test.ts     🔄 Session management (requires WASM)
└── wasm.test.ts        🔄 WASM integration (requires WASM)
```

## Current Status

### ✅ Passing Tests (7/7)
- **types.test.ts**: Type system validation
  - Credential enum values
  - Verification Level enum values
  - AppError enum values
  - IDKitError class behavior

### 🔄 WASM-Dependent Tests (54 tests, requires browser environment)

These tests require WASM initialization which needs:
- Actual `.wasm` binary file loading
- Web Crypto API (available in browsers or with polyfills)
- Fetch API for loading WASM

**Tests included**:
- **utils.test.ts** (14 tests): Signal encoding, key generation, encryption, base64
- **wasm.test.ts** (19 tests): WASM initialization, AppId, Request, Constraints
- **session.test.ts** (14 tests): Session creation, URL generation, validation

## Running WASM Tests

### Option 1: Browser Tests (Recommended)

Use the browser example to manually test WASM functionality:

```bash
cd examples/browser
python3 -m http.server 8000
```

Open http://localhost:8000 and check the browser console.

### Option 2: Playwright/Cypress (Future)

```bash
# TODO: Set up E2E tests with real browser environment
pnpm test:e2e
```

### Option 3: Node with WASM Polyfills

```bash
# Install polyfills for Node.js
pnpm add -D @peculiar/webcrypto node-fetch

# Update vitest config to include polyfills
# Then run: pnpm test --run wasm
```

## Test Coverage

| Module | Coverage | Notes |
|--------|----------|-------|
| types.ts | ✅ 100% | All enums and error class |
| utils.ts | 🔄 Pending | Needs WASM environment |
| session.ts | 🔄 Pending | Needs WASM + fetch mocking |
| wasm-loader.ts | 🔄 Pending | Needs WASM environment |

## Writing New Tests

### Basic Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### WASM-Dependent Test Template

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initIDKit } from '../wasm-loader';

describe('WASM Feature', () => {
  beforeAll(async () => {
    await initIDKit();
  });

  it('should work with WASM', () => {
    // Your test here
  });
});
```

### Mocking Fetch

```typescript
import { vi } from 'vitest';

it('should handle network requests', async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: 'test' }),
  });
  global.fetch = mockFetch;

  // Your test here
});
```

## Known Limitations

1. **WASM Loading**: Node.js cannot load WASM modules the same way browsers do
2. **Web Crypto API**: Not available in Node.js without polyfills
3. **Fetch API**: Built-in in Node 18+ but behavior differs from browsers

## Future Improvements

- [ ] Add Playwright for browser-based WASM tests
- [ ] Add Node.js polyfills for crypto/fetch
- [ ] Add integration tests with mock bridge server
- [ ] Add performance benchmarks
- [ ] Add mutation testing
