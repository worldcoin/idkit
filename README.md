# IDKit - World ID SDK (Rust-Core Monorepo)

IDKit is the toolkit for identity online. With IDKit you can easily interact with the [World ID Protocol](https://world.org/world-id).

IDKit has multi-language support, facilitated by this monorepo which uses a common Rust core.

## Packages

### Rust Core
- **`idkit-core`**: Core Rust implementation
- **`idkit-uniffi`**: UniFFI bindings generator for Swift and Kotlin
- **`idkit-wasm`**: WebAssembly bindings for browsers

### Platform SDKs
- **Swift** (`swift/`): iOS and macOS SDK via UniFFI
- **Kotlin** (`kotlin/`): Android and JVM SDK via UniFFI
- **JavaScript** (`js/packages/`):
  - `@worldcoin/idkit-core`: WASM-powered core for browsers and Node.js
  - `@worldcoin/idkit-react`: React components and hooks
  - `@worldcoin/idkit-react-native`: React Native components
  - `@worldcoin/idkit-standalone`: Standalone widgets

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              Platform UIs & Wrappers            │
│  (React, React Native, Swift UI, Compose)       │
└─────────────────┬──────────────┬────────────────┘
                  │              │
         ┌────────┴─────┐   ┌────┴──────┐
         │  UniFFI      │   │   WASM    │
         │  Bindings    │   │  Bindings │
         │(Swift/Kotlin)│   │(Browser/  │
         └────────┬─────┘   │ Node.js)  │
                  │         └─────┬─────┘
                  │               │
             ┌────┴───────────────┴─────┐
             │   Rust IDKit Core        │
             │  • Types & Constraints   │
             │  • Bridge interactions   │
             │  • Cryptography          │
             │  • Session Management    │
             │  • Proof Verification    │
             └──────────────────────────┘
```

## API Design

### Declarative Credential Requests

Instead of the old `verification_level` enum, you now declaratively specify which credentials you'll accept:

```rust
// Single credential (Orb only)
let requests = vec![
    Request::new(Credential::Orb, signal)
];

// Fallback credentials (prefer Orb, fall back to Face)
let requests = vec![
    Request::new(Credential::Orb, signal).with_face_auth(true),
    Request::new(Credential::Face, signal).with_face_auth(true),
];

let constraints = Constraints::any(vec![Credential::Orb, Credential::Face]);
```

### Constraints System

The constraint system supports complex AND/OR logic:

```rust
// ANY: User must have at least one of these
Constraints::any(vec![Credential::Orb, Credential::Face, Credential::Device])

// ALL: User must have all of these
Constraints::all(vec![Credential::Orb, Credential::Face])

// Nested: Orb OR (SecureDocument OR Document)
Constraints::new(ConstraintNode::Any {
    any: vec![
        ConstraintNode::Credential(Credential::Orb),
        ConstraintNode::Any {
            any: vec![
                ConstraintNode::Credential(Credential::SecureDocument),
                ConstraintNode::Credential(Credential::Document),
            ]
        }
    ]
})
```

## Getting Started

### Rust

```rust
use idkit_core::{AppId, Credential, Request, Session, SessionConfig, Constraints};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app_id = AppId::new("app_your_app_id")?;

    let config = SessionConfig::new(app_id, "verify-human")
        .with_request(Request::new(
            Credential::Orb,
            "user_123".to_string()
        ))
        .with_constraints(Constraints::any(vec![Credential::Orb]));

    let session = Session::create(config).await?;

    println!("Connect URL: {}", session.connect_url());

    let proof = session.wait_for_proof().await?;
    println!("Received proof: {:?}", proof);

    Ok(())
}
```

### Swift

```swift
import IDKit

let appId = try createAppId(appId: "app_your_app_id")
let config = createSessionConfig(appId: appId, action: "verify-human")

let request = createRequest(
    credentialType: .orb,
    signal: "user_123",
    faceAuth: true
)

let configWithRequest = sessionConfigAddRequest(config: config, request: request)
let session = try await createSession(config: configWithRequest)

print("Connect URL: \(sessionConnectUrl(session: session))")

let proof = try await sessionWaitForProof(session: session)
print("Received proof: \(proof)")
```

### JavaScript/TypeScript

```typescript
import { AppId, SessionConfig, Credential, Request } from '@worldcoin/idkit-core';

const appId = new AppId('app_your_app_id');
const request = new Request(Credential.Orb, 'user_123').withFaceAuth(true);

const config = new SessionConfig(appId, 'verify-human')
    .withRequest(request);

const session = await Session.create(config);
console.log('Connect URL:', session.connectUrl());

const proof = await session.waitForProof();
console.log('Received proof:', proof);
```

## 🔧 Development

### Prerequisites

- Rust 1.70+ (`rustup install stable`)
- Node.js 18+ (for JS packages)
- Swift 5.9+ (for Swift bindings, macOS only)
- Kotlin 2.0+ (for Kotlin bindings)
- Android NDK (for Android builds)

### Building

```bash
# Build Rust core
cargo build --package idkit-core

# Build UniFFI bindings
cargo build --package idkit-uniffi --release

# Build WASM bindings
cargo build --package idkit-wasm --target wasm32-unknown-unknown

# Build Swift bindings (macOS only)
./scripts/build-swift.sh

# Build Kotlin bindings
./scripts/build-kotlin.sh

# Build JS packages
cd js && pnpm install && pnpm build
```

### Testing

```bash
# Test Rust core
cargo test --package idkit-core

# Test all Rust packages
cargo test --workspace

# Test JS packages
cd js && pnpm test
```

## Documentation

All the technical docs for the World ID SDK, World ID Protocol, examples, guides can be found at https://docs.world.org/

## License

MIT License - see [LICENSE](./LICENSE) for details.
