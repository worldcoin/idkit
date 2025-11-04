//! # `IDKit` Core
//!
//! Core Rust implementation of the World ID SDK for Relying Parties.
//! This library provides the fundamental types and logic for interacting with
//! the World ID protocol, including constraint evaluation, proof verification,
//! and cryptographic operations.

#![warn(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

pub mod constraints;
pub mod crypto;
pub mod error;
pub mod types;
pub mod verification;

// Re-export main types for convenience
pub use constraints::{ConstraintNode, Constraints};
pub use error::{Error, Result};
pub use types::{AppId, BridgeUrl, Credential, Proof, Request, VerificationLevel};
pub use verification::verify_proof;

// UniFFI scaffolding for core types
#[cfg(feature = "uniffi-bindings")]
uniffi::setup_scaffolding!("idkit_core");
