# IDKit - World ID SDK (Rust Core)

IDKit is the toolkit for identity online. With IDKit you can easily interact with the [World ID Protocol](https://world.org/world-id).

## Packages

### Rust Core
- **`idkit-core`**: Core Rust types (Credential, Request, Proof)
- **`idkit-uniffi`**: UniFFI bindings scaffolding for future Swift/Kotlin support
- **`idkit-wasm`**: WebAssembly bindings scaffolding for future browser support

## Getting Started

### Basic Types

```rust
use idkit_core::{Credential, Request, Proof};
use serde_json;

// Create a request
let request = Request {
    credential_type: Credential::Orb,
    signal: "user_123".to_string(),
    face_auth: Some(true),
};

// Serialize to JSON
let json = serde_json::to_string(&request)?;
println!("Request JSON: {}", json);

// Deserialize from JSON
let parsed: Request = serde_json::from_str(&json)?;

// Create a proof
let proof = Proof {
    proof: "0x123...".to_string(),
    merkle_root: "0x456...".to_string(),
    nullifier_hash: "0x789...".to_string(),
    verification_level: Credential::Orb,
};
```

## 🔧 Development

### Prerequisites

- Rust 1.70+ (`rustup install stable`)

### Building

```bash
# Build all packages
cargo build

# Build specific packages
cargo build --package idkit-core
cargo build --package idkit-uniffi
cargo build --package idkit-wasm

# Build for release
cargo build --release
```

### Testing

```bash
# Test all packages
cargo test

# Test with verbose output
cargo test -- --nocapture

# Run clippy lints
cargo clippy --all-targets --all-features
```

## Documentation

All the technical docs for the World ID SDK, World ID Protocol, examples, guides can be found at https://docs.world.org/

## License

MIT License - see [LICENSE](./LICENSE) for details.
