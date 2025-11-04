//! # `IDKit` Core
//!
//! Core Rust implementation of the World ID SDK for Relying Parties.
//! This library provides the core types and logic for interacting with
//! the World ID protocol, including constraint evaluation, proof verification,
//! and cryptographic operations.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

pub mod bridge;
pub mod constraints;
pub mod crypto;
pub mod error;
pub mod session;
pub mod types;
pub mod verification;

pub use bridge::BridgeClient;
pub use constraints::{ConstraintNode, Constraints};
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub use crypto::CryptoKey;
pub use error::{Error, Result};
pub use session::Session;
pub use types::{AppId, BridgeUrl, Credential, Proof, Request, Signal, VerificationLevel};
pub use verification::verify_proof;

// UniFFI scaffolding for core types
#[cfg(feature = "uniffi-bindings")]
uniffi::setup_scaffolding!("idkit_core");
