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
import { useWorldBridgeStore } from '@worldcoin/idkit-core'

// 1. Get store instance
const store = useWorldBridgeStore()

// 2. Create client with explicit requests
const client = await store.createClient({
  app_id: 'app_staging_xxxxx',
  action: 'my-action',
  requests: [
    { credential_type: 'orb', signal: 'user-id-123' },
  ],
})

// 3. Display QR code for World App
console.log('Scan this:', client.connectorURI)

// 4. Poll for proof (handles polling automatically)
try {
  const proof = await client.pollForUpdates()
  console.log('Success:', proof)
} catch (error) {
  console.error('Verification failed:', error)
}
```

## Multiple Credential Types

You can request verification with multiple credential types. The user can satisfy the request with any of them:

```typescript
const client = await store.createClient({
  app_id: 'app_staging_xxxxx',
  action: 'my-action',
  requests: [
    { credential_type: 'orb', signal: 'user-id-123' },
    { credential_type: 'device', signal: 'user-id-123' },
  ],
})
```

## Credential Types

- `orb` - Verified via Orb biometric scan (highest trust)
- `face` - Verified via Face ID
- `device` - Verified via device binding
- `document` - Verified via document scan
- `secure_document` - Verified via secure document scan

## API Reference

### Creating a Client

```typescript
const client = await store.createClient(config)
```

**Config:**
```typescript
interface IDKitConfig {
  app_id: `app_${string}`        // Your World ID app ID
  action: string                  // Action identifier
  requests: RequestConfig[]       // Required: credential type requests
  bridge_url?: string            // Custom bridge URL (optional)
  partner?: boolean              // Partner mode (optional)
}

interface RequestConfig {
  credential_type: CredentialType
  signal?: string | AbiEncodedValue  // Optional signal for this request
}

type CredentialType = 'orb' | 'face' | 'device' | 'document' | 'secure_document'
```

**Client Properties:**
- `connectorURI: string` - QR code URL for World App
- `requestId: string` - Unique request ID

**Client Methods:**
- `pollForUpdates(options?: WaitOptions): Promise<ISuccessResult>` - Poll for proof (auto-polls)
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

**Methods:**
- `createClient(config: IDKitConfig): Promise<WorldBridgeClient>` - Create new client
- `reset(): void` - Clear state and start over

**State (for reactive frameworks):**
- `verificationState: VerificationState` - Current verification state
- `connectorURI: string | null` - QR code URL for World App
- `result: ISuccessResult | null` - Proof data when verified
- `errorCode: AppErrorCodes | null` - Error code if failed

### Result Types

```typescript
interface ISuccessResult {
  proof: string
  merkle_root: string
  nullifier_hash: string
  verification_level: CredentialType  // The credential type used
}
```

## React Integration

```tsx
import { useWorldBridgeStore, IDKitWidget } from '@worldcoin/idkit-core'

function MyComponent() {
  const handleSuccess = (result) => {
    console.log('Verified:', result)
  }

  return (
    <IDKitWidget
      app_id="app_staging_xxxxx"
      action="my-action"
      requests={[
        { credential_type: 'orb', signal: 'user-123' },
      ]}
      onSuccess={handleSuccess}
    >
      {({ open }) => <button onClick={open}>Verify with World ID</button>}
    </IDKitWidget>
  )
}
```

## Examples

See [examples/browser](../../examples/browser) for a complete working example.

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
