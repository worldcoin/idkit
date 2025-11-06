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

## API Reference

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
