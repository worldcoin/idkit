# @worldcoin/idkit-core

Core bridge logic for IDKit (World ID SDK) powered by Rust/WASM.

## Installation

```bash
npm install @worldcoin/idkit-core
# or
pnpm add @worldcoin/idkit-core
```

## Quick Start

```typescript
import {
  useWorldBridgeStore,
  VerificationLevel,
} from '@worldcoin/idkit-core'

// 1. Get store instance
const store = useWorldBridgeStore()

// 2. Create verification request (auto-initializes WASM on first call)
await store.createClient({
  app_id: 'app_staging_xxxxx',
  action: 'my-action',
  verification_level: VerificationLevel.Orb,
  signal: 'user-id-123',
})

// 3. Get QR code URL for World App
console.log('Scan this:', store.connectorURI)

// 4. Poll for proof
await store.pollForUpdates()

// 5. Check result
const { result, errorCode, verificationState } = store
if (result) {
  console.log('Proof received:', result)
}
```

### Advanced: Explicit Initialization (Optional)

For better error handling or to control when WASM loads:

```typescript
import { initIDKit, useWorldBridgeStore } from '@worldcoin/idkit-core'

// Optional: Initialize early to fail fast if WASM not supported
await initIDKit()

// Then use as normal
const store = useWorldBridgeStore()
await store.createClient({ ... })
```

## Architecture

IDKit Core v3.0 uses a **thin protocol layer** approach:

- **WASM**: Cryptography (AES-256-GCM encryption, Keccak256 hashing) compiled from Rust
- **JavaScript**: HTTP communication using browser's native `fetch()` API
- **Why?**: Keeps bundle size small while ensuring crypto consistency across platforms (JS, Swift, Kotlin)

This means crypto operations are guaranteed to be identical across all SDKs, while HTTP and state management use platform-native APIs.

## API Reference

### Initialization (Optional)

```typescript
await initIDKit(): Promise<void>
```

**Optional:** Pre-initializes the WASM module. `createClient()` automatically initializes WASM on first call, so manual initialization is only needed for:
- Early error detection (fail fast if WASM not supported)
- Performance optimization (initialize during app startup)
- Bundle splitting control (lazy load WASM)

### Store

```typescript
const store = useWorldBridgeStore()
```

**State:**
- `verificationState: VerificationState` - Current verification state
- `connectorURI: string | null` - QR code URL for World App
- `result: ISuccessResult | null` - Proof data when verified
- `errorCode: AppErrorCodes | null` - Error code if failed

**Methods:**
- `createClient(config: IDKitConfig): Promise<void>` - Start verification request
- `pollForUpdates(): Promise<void>` - Check for proof (call repeatedly)
- `reset(): void` - Clear state and start over

### Types

```typescript
interface IDKitConfig {
  app_id: `app_${string}`
  action: string
  signal?: string
  verification_level?: VerificationLevel
  bridge_url?: string
  partner?: boolean
}

interface ISuccessResult {
  proof: string
  merkle_root: string
  nullifier_hash: string
  verification_level: VerificationLevel
}

enum VerificationLevel {
  Orb = 'orb',
  Face = 'face',
  Device = 'device',
  Document = 'document',
  SecureDocument = 'secure_document',
}
```

### Utilities

```typescript
// Signal hashing (keccak256)
hashToField(input: string): HashFunctionOutput

// ABI encoding
solidityEncode(types: string[], values: unknown[]): AbiEncodedValue
```

## Migration from v2.x

### Key Changes

1. **Drop-in replacement** - Same API, no code changes needed
2. **Crypto powered by Rust/WASM** - Same crypto as Swift/Kotlin SDKs (cross-platform consistency)
3. **Bundle size** - Now 164KB total (42KB JS + 122KB WASM, was ~180KB in v2)

### Before (v2.x)

```typescript
import { useWorldBridgeStore } from '@worldcoin/idkit-core'

const store = useWorldBridgeStore()
await store.createClient({ ... })
```

### After (v3.0)

```typescript
import { useWorldBridgeStore } from '@worldcoin/idkit-core'

// Identical API - no changes needed!
const store = useWorldBridgeStore()
await store.createClient({ ... })  // Auto-initializes WASM on first call
```

That's it! WASM initialization happens automatically. No code changes needed.

## Examples

See [examples/browser](./examples/browser) for a complete working example.

## Building from Source

```bash
# Build WASM module
npm run build:wasm

# Build TypeScript
npm run build:ts

# Or both
npm run build
```

## License

MIT
