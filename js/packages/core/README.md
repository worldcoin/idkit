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
  initIDKit,
  useWorldBridgeStore,
  VerificationLevel,
} from '@worldcoin/idkit-core'

// 1. Initialize WASM (required before using any IDKit features!)
await initIDKit()

// 2. Get store instance
const store = useWorldBridgeStore.getState()

// 3. Create verification request
await store.createClient({
  app_id: 'app_staging_xxxxx',
  action: 'my-action',
  verification_level: VerificationLevel.Orb,
  signal: 'user-id-123',
})

// 4. Get QR code URL for World App
console.log('Scan this:', store.connectorURI)

// 5. Poll for proof
await store.pollForUpdates()

// 6. Check result
const { result, errorCode, verificationState } = store
if (result) {
  console.log('Proof received:', result)
}
```

## Architecture

IDKit Core v3.0 uses a **thin protocol layer** approach:

- **WASM**: Cryptography (AES-256-GCM encryption, Keccak256 hashing) compiled from Rust
- **JavaScript**: HTTP communication using browser's native `fetch()` API
- **Why?**: Keeps bundle size small while ensuring crypto consistency across platforms (JS, Swift, Kotlin)

This means crypto operations are guaranteed to be identical across all SDKs, while HTTP and state management use platform-native APIs.

## API Reference

### Initialization

```typescript
await initIDKit(): Promise<void>
```

**Must be called before using any other IDKit functionality.** Initializes the WASM module.

### Store

```typescript
const store = useWorldBridgeStore.getState()
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

1. **WASM initialization required** - Must call `await initIDKit()` before use
2. **Crypto powered by Rust** - Same crypto as Swift/Kotlin SDKs
3. **Bundle size** - Now 164KB total (42KB JS + 122KB WASM)

### Before (v2.x)

```typescript
import { useWorldBridgeStore } from '@worldcoin/idkit-core'

// Could use immediately
const store = useWorldBridgeStore()
await store.createClient({ ... })
```

### After (v3.0)

```typescript
import { initIDKit, useWorldBridgeStore } from '@worldcoin/idkit-core'

// Must initialize WASM first!
await initIDKit()

// Then use as before
const store = useWorldBridgeStore.getState()
await store.createClient({ ... })
```

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
