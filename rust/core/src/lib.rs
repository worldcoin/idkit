//! # `IDKit` Core
//!
//! Core Rust implementation of the World ID SDK for Relying Parties.
//! This library provides the core types and logic for interacting with
//! the World ID protocol, including constraint evaluation, proof verification,
//! and cryptographic operations.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::missing_const_for_fn)]
#![cfg_attr(target_arch = "wasm32", allow(clippy::future_not_send))]

#[cfg(any(feature = "bridge", feature = "bridge-wasm"))]
pub mod bridge;
pub mod constraints;
pub mod crypto;
pub mod error;
pub mod issuer_schema;
pub mod preset;
pub mod protocol_types;
#[cfg(feature = "rp-signature")]
pub mod rp_signature;
pub mod types;
#[cfg(feature = "verification")]
pub mod verification;

#[cfg(feature = "wasm-bindings")]
pub mod wasm_bindings;

#[cfg(any(feature = "bridge", feature = "bridge-wasm"))]
pub use bridge::{IDKitRequest, Status};
#[cfg(all(any(feature = "bridge", feature = "bridge-wasm"), feature = "ffi"))]
pub use bridge::{IDKitRequestBuilder, IDKitRequestConfig};
pub use constraints::ConstraintNode;
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub use crypto::CryptoKey;
pub use error::{Error, Result};
pub use issuer_schema::{credential_to_issuer_schema_id, issuer_schema_id_to_credential};
pub use preset::{OrbLegacyPreset, Preset};
pub use types::{
    AppId, BridgeUrl, CredentialRequest, CredentialType, Proof, RpContext, Signal,
    VerificationLevel,
};

#[cfg(feature = "verification")]
pub use verification::{verify_proof, verify_proof_with_endpoint};

// UniFFI scaffolding for core types
#[cfg(feature = "ffi")]
uniffi::setup_scaffolding!("idkit_core");
