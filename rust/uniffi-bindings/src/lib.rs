//! `UniFFI` bindings for `IDKit`
//!
//! This crate generates Swift and Kotlin bindings for the core `IDKit` library.
//! Provides a mobile-friendly API for creating and validating World ID requests and proofs.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

use idkit_core::{CredentialType, Proof, Request as CoreRequest, Signal as CoreSignal};

/// Signal wrapper for `UniFFI`
///
/// Represents a signal that can be either a string or ABI-encoded bytes.
#[derive(Debug, Clone, uniffi::Object)]
pub struct Signal(CoreSignal);

/// Opaque request handle for `UniFFI`
///
/// This wraps the core `Request` type to work around `UniFFI` limitations with custom types.
#[derive(Debug, Clone, uniffi::Object)]
pub struct Request(CoreRequest);

/// Error type for `UniFFI` bindings
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum IdkitError {
    /// Invalid configuration provided
    #[error("Invalid configuration: {message}")]
    InvalidConfiguration { message: String },

    /// JSON serialization/deserialization error
    #[error("JSON error: {message}")]
    JsonError { message: String },

    /// Cryptographic operation error
    #[error("Cryptography error: {message}")]
    CryptoError { message: String },

    /// Base64 encoding/decoding error
    #[error("Base64 error: {message}")]
    Base64Error { message: String },

    /// URL parsing error
    #[error("URL error: {message}")]
    UrlError { message: String },

    /// Invalid proof provided
    #[error("Invalid proof: {message}")]
    InvalidProof { message: String },

    /// Bridge communication error
    #[error("Bridge error: {message}")]
    BridgeError { message: String },

    /// Application-level error
    #[error("App error: {message}")]
    AppError { message: String },

    /// Unexpected response from bridge
    #[error("Unexpected response from bridge")]
    UnexpectedResponse,

    /// Connection to bridge failed
    #[error("Connection to bridge failed")]
    ConnectionFailed,

    /// Request timed out
    #[error("Request timed out")]
    Timeout,
}

impl From<idkit_core::Error> for IdkitError {
    fn from(e: idkit_core::Error) -> Self {
        match e {
            idkit_core::Error::InvalidConfiguration(message) => Self::InvalidConfiguration { message },
            idkit_core::Error::Json(e) => Self::JsonError { message: e.to_string() },
            idkit_core::Error::Crypto(message) => Self::CryptoError { message },
            idkit_core::Error::Base64(e) => Self::Base64Error { message: e.to_string() },
            idkit_core::Error::Url(e) => Self::UrlError { message: e.to_string() },
            idkit_core::Error::InvalidProof(message) => Self::InvalidProof { message },
            idkit_core::Error::BridgeError(message) => Self::BridgeError { message },
            idkit_core::Error::AppError(app_err) => Self::AppError { message: app_err.to_string() },
            idkit_core::Error::UnexpectedResponse => Self::UnexpectedResponse,
            idkit_core::Error::ConnectionFailed => Self::ConnectionFailed,
            idkit_core::Error::Timeout => Self::Timeout,
            #[allow(unreachable_patterns)]
            _ => Self::BridgeError { message: format!("{e}") },
        }
    }
}

// Signal constructors

#[uniffi::export]
impl Signal {
    /// Creates a signal from a string
    #[must_use]
    #[uniffi::constructor]
    pub fn from_string(s: String) -> Self {
        Self(CoreSignal::from_string(s))
    }

    /// Creates a signal from ABI-encoded bytes
    ///
    /// Use this for on-chain use cases where the signal needs to be ABI-encoded
    /// according to Solidity encoding rules.
    #[must_use]
    #[uniffi::constructor]
    pub fn from_abi_encoded(bytes: Vec<u8>) -> Self {
        Self(CoreSignal::from_abi_encoded(bytes))
    }

    /// Gets the signal as raw bytes
    #[must_use]
    pub fn as_bytes(&self) -> Vec<u8> {
        self.0.as_bytes().to_vec()
    }

    /// Gets the signal as a string if it's a UTF-8 string signal
    #[must_use]
    pub fn as_string(&self) -> Option<String> {
        self.0.as_str().map(String::from)
    }
}

// Request constructors and methods

#[uniffi::export]
impl Request {
    /// Creates a new credential request
    ///
    /// # Arguments
    /// * `credential_type` - The type of credential to request (Orb, Face, Device, etc.)
    /// * `signal` - Optional signal for the proof. Use `Signal::from_string()` or `Signal::from_abi_encoded()`
    #[must_use]
    #[uniffi::constructor]
    pub fn new(credential_type: CredentialType, signal: Option<std::sync::Arc<Signal>>) -> Self {
        let signal_opt = signal.map(|s| s.0.clone());
        Self(CoreRequest::new(credential_type, signal_opt))
    }

    /// Sets the face authentication requirement on a request
    ///
    /// Returns a new request with the face auth set
    #[must_use]
    pub fn with_face_auth(&self, face_auth: bool) -> Self {
        let mut new_request = self.0.clone();
        new_request.face_auth = Some(face_auth);
        Self(new_request)
    }

    /// Gets the signal as raw bytes from a request
    #[must_use]
    pub fn get_signal_bytes(&self) -> Option<Vec<u8>> {
        self.0.signal_bytes()
    }

    /// Gets the credential type
    #[must_use]
    pub const fn credential_type(&self) -> CredentialType {
        self.0.credential_type
    }

    /// Gets the `face_auth` setting
    #[must_use]
    pub const fn face_auth(&self) -> Option<bool> {
        self.0.face_auth
    }

    /// Serializes a request to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON serialization fails
    pub fn to_json(&self) -> Result<String, IdkitError> {
        serde_json::to_string(&self.0).map_err(|e| IdkitError::JsonError { message: e.to_string() })
    }

    /// Deserializes a request from JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON deserialization fails
    #[uniffi::constructor]
    pub fn from_json(json: &str) -> Result<Self, IdkitError> {
        serde_json::from_str(json).map(Self).map_err(|e| IdkitError::JsonError { message: e.to_string() })
    }
}

// Proof methods

/// Serializes a proof to JSON
///
/// # Errors
///
/// Returns an error if JSON serialization fails
#[uniffi::export]
pub fn proof_to_json(proof: &Proof) -> Result<String, IdkitError> {
    serde_json::to_string(proof).map_err(|e| IdkitError::JsonError { message: e.to_string() })
}

/// Deserializes a proof from JSON
///
/// # Errors
///
/// Returns an error if JSON deserialization fails
#[uniffi::export]
pub fn proof_from_json(json: &str) -> Result<Proof, IdkitError> {
    serde_json::from_str(json).map_err(|e| IdkitError::JsonError { message: e.to_string() })
}

// Credential methods

/// Gets the string representation of a credential type
#[must_use]
#[uniffi::export]
pub fn credential_to_string(credential: &CredentialType) -> String {
    match credential {
        CredentialType::Orb => "orb".to_string(),
        CredentialType::Face => "face".to_string(),
        CredentialType::SecureDocument => "secure_document".to_string(),
        CredentialType::Document => "document".to_string(),
        CredentialType::Device => "device".to_string(),
    }
}

// Generate UniFFI scaffolding
uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_request() {
        let signal = Signal::from_string("test_signal".to_string());
        let request = Request::new(CredentialType::Orb, Some(std::sync::Arc::new(signal)));
        assert_eq!(request.credential_type(), CredentialType::Orb);
        assert!(request.get_signal_bytes().is_some());
        assert_eq!(request.get_signal_bytes().unwrap(), b"test_signal");
        assert_eq!(request.face_auth(), None);

        let with_face_auth = request.with_face_auth(true);
        assert_eq!(with_face_auth.face_auth(), Some(true));
    }

    #[test]
    fn test_create_request_without_signal() {
        let request = Request::new(CredentialType::Device, None);
        assert_eq!(request.credential_type(), CredentialType::Device);
        assert_eq!(request.get_signal_bytes(), None);
        assert_eq!(request.face_auth(), None);
    }

    #[test]
    fn test_create_request_with_abi_encoded() {
        let bytes = vec![0xFF, 0xFE, 0xFD, 0x00, 0x01];
        let signal = Signal::from_abi_encoded(bytes.clone());
        let request = Request::new(CredentialType::Orb, Some(std::sync::Arc::new(signal)));

        assert_eq!(request.credential_type(), CredentialType::Orb);
        assert!(request.get_signal_bytes().is_some());

        // Verify we can get bytes back
        let decoded = request.get_signal_bytes().unwrap();
        assert_eq!(decoded, bytes);

        let with_face_auth = request.with_face_auth(true);
        assert_eq!(with_face_auth.face_auth(), Some(true));
    }

    #[test]
    fn test_get_signal_bytes_string() {
        let signal = Signal::from_string("my_signal".to_string());
        let request = Request::new(CredentialType::Face, Some(std::sync::Arc::new(signal)));
        let bytes = request.get_signal_bytes().unwrap();
        assert_eq!(bytes, b"my_signal");
    }

    #[test]
    fn test_get_signal_bytes_none() {
        let request = Request::new(CredentialType::Device, None);
        let bytes = request.get_signal_bytes();
        assert_eq!(bytes, None);
    }

    #[test]
    fn test_request_json_roundtrip() {
        let signal = Signal::from_string("signal_123".to_string());
        let request = Request::new(CredentialType::Face, Some(std::sync::Arc::new(signal)));

        let json = request.to_json().unwrap();
        assert!(json.contains("face"));
        assert!(json.contains("signal_123"));

        let parsed = Request::from_json(&json).unwrap();
        assert_eq!(parsed.credential_type(), CredentialType::Face);
        assert!(parsed.get_signal_bytes().is_some());
        assert_eq!(parsed.get_signal_bytes().unwrap(), b"signal_123");
        assert_eq!(parsed.face_auth(), None);
    }

    #[test]
    fn test_proof_json_roundtrip() {
        let proof = Proof {
            proof: "0x123".to_string(),
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: CredentialType::Orb,
        };

        let json = proof_to_json(&proof).unwrap();
        let parsed = proof_from_json(&json).unwrap();

        assert_eq!(parsed.proof, "0x123");
        assert_eq!(parsed.merkle_root, "0x456");
        assert_eq!(parsed.nullifier_hash, "0x789");
        assert_eq!(parsed.verification_level, CredentialType::Orb);
    }

    #[test]
    fn test_credential_to_string() {
        assert_eq!(credential_to_string(&CredentialType::Orb), "orb");
        assert_eq!(credential_to_string(&CredentialType::Face), "face");
        assert_eq!(credential_to_string(&CredentialType::Device), "device");
        assert_eq!(credential_to_string(&CredentialType::SecureDocument), "secure_document");
        assert_eq!(credential_to_string(&CredentialType::Document), "document");
    }
}
