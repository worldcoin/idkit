//! `UniFFI` bindings for `IDKit`
//!
//! This crate generates Swift and Kotlin bindings for the core `IDKit` library.
//! Provides a mobile-friendly API for creating and validating World ID requests and proofs.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

use idkit_core::{Credential, Proof, Request as CoreRequest};

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
        }
    }
}

// Request constructors and methods

#[uniffi::export]
impl Request {
    /// Creates a new credential request with a string signal
    ///
    /// # Arguments
    /// * `credential_type` - The type of credential to request (Orb, Face, Device, etc.)
    /// * `signal` - User-specific signal for the proof (pass empty string for no signal)
    #[must_use]
    #[uniffi::constructor]
    pub fn with_signal(credential_type: Credential, signal: String) -> Self {
        if signal.is_empty() {
            Self(CoreRequest::without_signal(credential_type))
        } else {
            Self(CoreRequest::with_signal(credential_type, signal))
        }
    }

    /// Creates a new credential request with a signal from arbitrary bytes
    ///
    /// This is useful for on-chain use cases where RPs need to provide custom-encoded signals.
    /// The bytes are hex-encoded internally for storage and transmission.
    ///
    /// # Arguments
    /// * `credential_type` - The type of credential to request
    /// * `signal_bytes` - Raw bytes for the signal
    #[must_use]
    #[uniffi::constructor]
    pub fn with_signal_bytes(credential_type: Credential, signal_bytes: &[u8]) -> Self {
        Self(CoreRequest::with_signal_bytes(credential_type, signal_bytes))
    }

    /// Creates a new credential request without a signal
    ///
    /// # Arguments
    /// * `credential_type` - The type of credential to request
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // UniFFI doesn't support const fn
    #[uniffi::constructor]
    pub fn without_signal(credential_type: Credential) -> Self {
        Self(CoreRequest::without_signal(credential_type))
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
    pub const fn credential_type(&self) -> Credential {
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
pub fn credential_to_string(credential: &Credential) -> String {
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
        let request = Request::with_signal(Credential::Orb, "test_signal".to_string());
        assert_eq!(request.credential_type(), Credential::Orb);
        assert!(request.get_signal_bytes().is_some());
        assert_eq!(request.get_signal_bytes().unwrap(), b"test_signal");
        assert_eq!(request.face_auth(), None);

        let with_face_auth = request.with_face_auth(true);
        assert_eq!(with_face_auth.face_auth(), Some(true));
    }

    #[test]
    fn test_create_request_empty_signal() {
        let request = Request::with_signal(Credential::Face, String::new());
        assert_eq!(request.credential_type(), Credential::Face);
        assert_eq!(request.get_signal_bytes(), None);
        assert_eq!(request.face_auth(), None);
    }

    #[test]
    fn test_create_request_without_signal() {
        let request = Request::without_signal(Credential::Device);
        assert_eq!(request.credential_type(), Credential::Device);
        assert_eq!(request.get_signal_bytes(), None);
        assert_eq!(request.face_auth(), None);
    }

    #[test]
    fn test_create_request_with_bytes() {
        let bytes = vec![0xFF, 0xFE, 0xFD, 0x00, 0x01];
        let request = Request::with_signal_bytes(Credential::Orb, &bytes);

        assert_eq!(request.credential_type(), Credential::Orb);
        assert!(request.get_signal_bytes().is_some());

        // Verify we can get bytes back
        let decoded = request.get_signal_bytes().unwrap();
        assert_eq!(decoded, bytes);

        let with_face_auth = request.with_face_auth(true);
        assert_eq!(with_face_auth.face_auth(), Some(true));
    }

    #[test]
    fn test_get_signal_bytes_string() {
        let request = Request::with_signal(Credential::Face, "my_signal".to_string());
        let bytes = request.get_signal_bytes().unwrap();
        assert_eq!(bytes, b"my_signal");
    }

    #[test]
    fn test_get_signal_bytes_none() {
        let request = Request::without_signal(Credential::Device);
        let bytes = request.get_signal_bytes();
        assert_eq!(bytes, None);
    }

    #[test]
    fn test_request_json_roundtrip() {
        let request = Request::with_signal(Credential::Face, "signal_123".to_string());

        let json = request.to_json().unwrap();
        assert!(json.contains("face"));
        assert!(json.contains("signal_123"));

        let parsed = Request::from_json(&json).unwrap();
        assert_eq!(parsed.credential_type(), Credential::Face);
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
            verification_level: Credential::Orb,
        };

        let json = proof_to_json(&proof).unwrap();
        let parsed = proof_from_json(&json).unwrap();

        assert_eq!(parsed.proof, "0x123");
        assert_eq!(parsed.merkle_root, "0x456");
        assert_eq!(parsed.nullifier_hash, "0x789");
        assert_eq!(parsed.verification_level, Credential::Orb);
    }

    #[test]
    fn test_credential_to_string() {
        assert_eq!(credential_to_string(&Credential::Orb), "orb");
        assert_eq!(credential_to_string(&Credential::Face), "face");
        assert_eq!(credential_to_string(&Credential::Device), "device");
        assert_eq!(credential_to_string(&Credential::SecureDocument), "secure_document");
        assert_eq!(credential_to_string(&Credential::Document), "document");
    }
}
