//! # IDKit Core
//!
//! Core Rust implementation of the World ID SDK for Relying Parties.
//! This library provides the fundamental types and logic for interacting with
//! the World ID protocol, including session management, proof verification,
//! and cryptographic operations.

#![warn(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

#[cfg(feature = "bridge-client")]
pub mod bridge;
pub mod constraints;
pub mod crypto;
pub mod error;
#[cfg(feature = "bridge-client")]
pub mod session;
pub mod types;
#[cfg(feature = "bridge-client")]
pub mod verification;

// Re-export main types for convenience
pub use constraints::{ConstraintNode, Constraints};
pub use error::{Error, Result};
#[cfg(feature = "bridge-client")]
pub use session::Session;
pub use types::{
    AppId, BridgeUrl, Credential, Proof, Request, VerificationLevel,
};
#[cfg(feature = "bridge-client")]
pub use verification::verify_proof;

// UniFFI scaffolding for core types
#[cfg(feature = "uniffi-bindings")]
uniffi::setup_scaffolding!("idkit_core");
