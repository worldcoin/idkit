//! UniFFI bindings for IDKit
//!
//! This crate generates Swift and Kotlin bindings for the core IDKit library.
//! Phase 1: Basic types and scaffolding only.

use idkit_core::{Credential, Proof, Request};

/// Error type for UniFFI
#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum IdkitError {
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("JSON error: {0}")]
    JsonError(String),
}

impl From<idkit_core::Error> for IdkitError {
    fn from(e: idkit_core::Error) -> Self {
        match e {
            idkit_core::Error::InvalidConfiguration(s) => Self::InvalidConfiguration(s),
            idkit_core::Error::Json(e) => Self::JsonError(e.to_string()),
        }
    }
}

/// Creates a sample request for testing
#[uniffi::export]
pub fn create_sample_request(credential: Credential, signal: String) -> Request {
    Request {
        credential_type: credential,
        signal,
        face_auth: None,
    }
}

/// Creates a sample proof for testing
#[uniffi::export]
pub fn create_sample_proof(credential: Credential) -> Proof {
    Proof {
        proof: "0x123...".to_string(),
        merkle_root: "0x456...".to_string(),
        nullifier_hash: "0x789...".to_string(),
        verification_level: credential,
    }
}

/// Serializes a request to JSON string
#[uniffi::export]
pub fn serialize_request(request: Request) -> Result<String, IdkitError> {
    serde_json::to_string(&request).map_err(|e| IdkitError::JsonError(e.to_string()))
}

/// Deserializes a request from JSON string
#[uniffi::export]
pub fn deserialize_request(json: String) -> Result<Request, IdkitError> {
    serde_json::from_str(&json).map_err(|e| IdkitError::JsonError(e.to_string()))
}

/// Initialize the library
#[uniffi::export]
pub fn init() {
    // Initialization logic if needed
}

// Generate UniFFI scaffolding
uniffi::setup_scaffolding!();
