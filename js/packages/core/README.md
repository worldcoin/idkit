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

// 2. Create client - returns immutable client object
const client = await store.createClient({
  app_id: 'app_staging_xxxxx',
  action: 'my-action',
  verification_level: VerificationLevel.Orb,
  signal: 'user-id-123',
})

// 3. Display QR code for World App
console.log('Scan this:', client.connectorURI)

// 4. Wait for proof (handles polling automatically)
try {
  const proof = await client.waitForProof()
  console.log('Success:', proof)
} catch (error) {
  console.error('Verification failed:', error)
}
```

## V2 API

```typescript
const store = useWorldBridgeStore()

await store.createClient({
  app_id: 'app_staging_xxxxx',
  action: 'my-action',
  verification_level: VerificationLevel.Orb,
  signal: 'user-id-123',
})

console.log('Scan this:', store.connectorURI)

await store.pollForUpdates()

if (store.result) {
  console.log('Proof received:', store.result)
}
```

## API Reference

```typescript
const client = await store.createClient(config)
```

**Properties:**
- `connectorURI: string` - QR code URL for World App
- `requestId: string` - Unique request ID

**Methods:**
- `waitForProof(options?: WaitOptions): Promise<ISuccessResult>` - Wait for proof (auto-polls)
- `pollOnce(): Promise<Status>` - Poll once for status (manual polling)

**WaitOptions:**
```typescript
interface WaitOptions {
  pollInterval?: number    // ms between polls (default: 1000)
  timeout?: number        // total timeout ms (default: 300000 = 5min)
  signal?: AbortSignal    // for cancellation
}
```

### Store

```typescript
const store = useWorldBridgeStore()
```

**V3 Methods:**
- `createClient(config: IDKitConfig): Promise<WorldBridgeClient>` - Create new client

**V2 State (backward compat):**
- `verificationState: VerificationState` - Current verification state
- `connectorURI: string | null` - QR code URL for World App
- `result: ISuccessResult | null` - Proof data when verified
- `errorCode: AppErrorCodes | null` - Error code if failed

**V2 Methods (deprecated):**
- `pollForUpdates(): Promise<void>` - Check for proof (call repeatedly) ⚠️ Use `client.waitForProof()` instead
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
