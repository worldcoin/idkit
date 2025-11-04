//! UniFFI bindings for IDKit
//!
//! This crate generates Swift and Kotlin bindings for the core IDKit library.
//! Provides a mobile-friendly API for creating and validating World ID requests and proofs.

use idkit_core::{Credential, Proof, Request};

/// Error type for UniFFI bindings
#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum IdkitError {
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("JSON serialization error: {0}")]
    JsonError(String),
    #[error("Cryptography error: {0}")]
    CryptoError(String),
    #[error("Base64 error: {0}")]
    Base64Error(String),
    #[error("URL error: {0}")]
    UrlError(String),
    #[error("Invalid proof: {0}")]
    InvalidProof(String),
    #[error("Bridge error: {0}")]
    BridgeError(String),
    #[error("App error: {0}")]
    AppError(String),
    #[error("Unexpected response from bridge")]
    UnexpectedResponse,
    #[error("Connection to bridge failed")]
    ConnectionFailed,
    #[error("Request timed out")]
    Timeout,
}

impl From<idkit_core::Error> for IdkitError {
    fn from(e: idkit_core::Error) -> Self {
        match e {
            idkit_core::Error::InvalidConfiguration(s) => Self::InvalidConfiguration(s),
            idkit_core::Error::Json(e) => Self::JsonError(e.to_string()),
            idkit_core::Error::Crypto(s) => Self::CryptoError(s),
            idkit_core::Error::Base64(e) => Self::Base64Error(e.to_string()),
            idkit_core::Error::Url(e) => Self::UrlError(e.to_string()),
            idkit_core::Error::InvalidProof(s) => Self::InvalidProof(s),
            idkit_core::Error::BridgeError(s) => Self::BridgeError(s),
            idkit_core::Error::AppError(app_err) => Self::AppError(app_err.to_string()),
            idkit_core::Error::UnexpectedResponse => Self::UnexpectedResponse,
            idkit_core::Error::ConnectionFailed => Self::ConnectionFailed,
            idkit_core::Error::Timeout => Self::Timeout,
        }
    }
}

/// Creates a new credential request
///
/// # Arguments
/// * `credential_type` - The type of credential to request (Orb, Face, Device, etc.)
/// * `signal` - User-specific signal for the proof
/// * `face_auth` - Optional face authentication requirement
#[uniffi::export]
pub fn create_request(
    credential_type: Credential,
    signal: String,
    face_auth: Option<bool>,
) -> Request {
    Request {
        credential_type,
        signal,
        face_auth,
    }
}

/// Serializes a request to JSON for transmission
#[uniffi::export]
pub fn request_to_json(request: &Request) -> Result<String, IdkitError> {
    serde_json::to_string(request).map_err(|e| IdkitError::JsonError(e.to_string()))
}

/// Deserializes a request from JSON
#[uniffi::export]
pub fn request_from_json(json: String) -> Result<Request, IdkitError> {
    serde_json::from_str(&json).map_err(|e| IdkitError::JsonError(e.to_string()))
}

/// Serializes a proof to JSON for verification
#[uniffi::export]
pub fn proof_to_json(proof: &Proof) -> Result<String, IdkitError> {
    serde_json::to_string(proof).map_err(|e| IdkitError::JsonError(e.to_string()))
}

/// Deserializes a proof from JSON
#[uniffi::export]
pub fn proof_from_json(json: String) -> Result<Proof, IdkitError> {
    serde_json::from_str(&json).map_err(|e| IdkitError::JsonError(e.to_string()))
}

/// Gets the string representation of a credential type
#[uniffi::export]
pub fn credential_to_string(credential: Credential) -> String {
    match credential {
        Credential::Orb => "orb".to_string(),
        Credential::Face => "face".to_string(),
        Credential::SecureDocument => "secure_document".to_string(),
        Credential::Document => "document".to_string(),
        Credential::Device => "device".to_string(),
    }
}

// Generate UniFFI scaffolding
uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_request() {
        let request = create_request(Credential::Orb, "test_signal".to_string(), Some(true));
        assert_eq!(request.credential_type, Credential::Orb);
        assert_eq!(request.signal, "test_signal");
        assert_eq!(request.face_auth, Some(true));
    }

    #[test]
    fn test_request_json_roundtrip() {
        let request = create_request(Credential::Face, "signal_123".to_string(), None);

        let json = request_to_json(&request).unwrap();
        assert!(json.contains("face"));
        assert!(json.contains("signal_123"));

        let parsed = request_from_json(json).unwrap();
        assert_eq!(parsed.credential_type, Credential::Face);
        assert_eq!(parsed.signal, "signal_123");
        assert_eq!(parsed.face_auth, None);
    }

    #[test]
    fn test_proof_json_roundtrip() {
        let proof = Proof {
            proof: "0x123".to_string(),
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: Credential::Orb,
        };

        let json = proof_to_json(&proof).unwrap();
        let parsed = proof_from_json(json).unwrap();

        assert_eq!(parsed.proof, "0x123");
        assert_eq!(parsed.merkle_root, "0x456");
        assert_eq!(parsed.nullifier_hash, "0x789");
        assert_eq!(parsed.verification_level, Credential::Orb);
    }

    #[test]
    fn test_credential_to_string() {
        assert_eq!(credential_to_string(Credential::Orb), "orb");
        assert_eq!(credential_to_string(Credential::Face), "face");
        assert_eq!(credential_to_string(Credential::Device), "device");
        assert_eq!(credential_to_string(Credential::SecureDocument), "secure_document");
        assert_eq!(credential_to_string(Credential::Document), "document");
    }
}
