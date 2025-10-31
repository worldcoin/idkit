# IDKit - World ID SDK (Rust-Core Monorepo)

A unified, Rust-powered SDK for integrating World ID verification into your applications. This monorepo consolidates all IDKit implementations (JavaScript, Swift, Kotlin) with a shared Rust core, ensuring consistency, performance, and maintainability across all platforms.

## 🚀 Features

- **Single Source of Truth**: Core logic implemented once in Rust, shared across all platforms
- **New Declarative API**: Flexible constraint system for requesting credentials with AND/OR logic
- **Multi-Platform**: Native bindings for Swift (iOS/macOS), Kotlin (Android/JVM), and JavaScript (Browser/Node.js)
- **Type-Safe**: Strong typing across all platforms via UniFFI and WASM
- **Performance**: Rust-powered cryptography and proof verification
- **Face Auth Support**: Request face authentication with orb or face credentials
- **Backward Compatible**: Helpers for migrating from the old `verification_level` API

## 📦 Packages

### Rust Core
- **`idkit-core`**: Core Rust implementation with all business logic
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
└────────────┬─────────────┬──────────────────────┘
             │             │
    ┌────────┴────┐   ┌────┴──────┐
    │  UniFFI     │   │   WASM    │
    │  Bindings   │   │  Bindings │
    │(Swift/Kotlin)│  │(Browser/  │
    └────────┬────┘   │ Node.js)  │
             │        └─────┬─────┘
             │              │
        ┌────┴──────────────┴─────┐
        │    Rust Core (idkit-core)│
        │  • Types & Constraints   │
        │  • Bridge Protocol       │
        │  • Cryptography          │
        │  • Session Management    │
        │  • Proof Verification    │
        └──────────────────────────┘
```

## 🎯 New API Design

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

## 🚦 Getting Started

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

## 📚 Documentation

- [API Reference](./docs/API.md)
- [Migration Guide](./docs/MIGRATION.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Building & Deployment](./docs/BUILD.md)

## 🔄 Migration from v2.x

The new API is a breaking change from v2.x. See the [Migration Guide](./docs/MIGRATION.md) for details.

**Quick migration:**

```rust
// Old API (v2.x)
Session::new(
    app_id,
    "action",
    VerificationLevel::Orb,
    bridge_url,
    "signal",
    None
).await

// New API (v3.0)
SessionConfig::from_verification_level(
    app_id,
    "action",
    VerificationLevel::Orb,
    "signal"
)
```

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 🔗 Links

- [World ID Documentation](https://docs.world.org/world-id)
- [Developer Portal](https://developer.worldcoin.org)
- [Discord Community](https://discord.gg/worldcoin)
