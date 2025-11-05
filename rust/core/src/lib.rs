//! # `IDKit` Core
//!
//! Core Rust implementation of the World ID SDK for Relying Parties.
//! This library provides the core types and logic for interacting with
//! the World ID protocol, including constraint evaluation, proof verification,
//! and cryptographic operations.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::missing_const_for_fn)]

#[cfg(feature = "bridge")]
pub mod bridge;
pub mod constraints;
pub mod crypto;
pub mod error;
pub mod types;
#[cfg(feature = "verification")]
pub mod verification;

#[cfg(feature = "bridge")]
pub use bridge::{Session, Status};
pub use constraints::{ConstraintNode, Constraints};
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub use crypto::CryptoKey;
pub use error::{Error, Result};
pub use types::{AppId, BridgeUrl, CredentialType, Proof, Request, Signal, VerificationLevel};
#[cfg(feature = "verification")]
pub use verification::{verify_proof, verify_proof_with_endpoint};

// UniFFI scaffolding for core types
#[cfg(feature = "uniffi-bindings")]
uniffi::setup_scaffolding!("idkit_core");
