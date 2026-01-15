//! Core types for the `IDKit` protocol

use serde::{Deserialize, Serialize};

#[cfg(feature = "ffi")]
use std::sync::Arc;

/// Credential types that can be requested
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum CredentialType {
    /// Orb credential
    Orb,
    /// Face credential
    Face,
    /// Secure NFC document with active or passive authentication, eID, or a Japanese MNC
    SecureDocument,
    /// NFC document without authentication
    Document,
    /// Device-based credential
    Device,
}

impl CredentialType {
    /// Returns all credential types
    #[must_use]
    pub fn all() -> Vec<Self> {
        vec![
            Self::Orb,
            Self::Face,
            Self::SecureDocument,
            Self::Document,
            Self::Device,
        ]
    }

    /// Returns the credential as a string
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Orb => "orb",
            Self::Face => "face",
            Self::SecureDocument => "secure_document",
            Self::Document => "document",
            Self::Device => "device",
        }
    }
}

/// A signal value that can be either a UTF-8 string or ABI-encoded data
///
/// Signals are used to create unique proofs. They can be:
/// - UTF-8 strings (common case for off-chain usage)
/// - ABI-encoded bytes (for on-chain use cases)
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
pub enum Signal {
    /// UTF-8 string signal
    String(String),
    /// ABI-encoded signal data (hex-encoded for JSON serialization)
    AbiEncoded(Vec<u8>),
}

impl Signal {
    /// Creates a signal from a string
    #[must_use]
    pub fn from_string(s: impl Into<String>) -> Self {
        Self::String(s.into())
    }

    /// Creates a signal from ABI-encoded bytes
    ///
    /// Use this for on-chain use cases where the signal needs to be ABI-encoded
    /// according to Solidity encoding rules.
    #[must_use]
    pub fn from_abi_encoded(bytes: impl Into<Vec<u8>>) -> Self {
        Self::AbiEncoded(bytes.into())
    }

    /// Gets the raw bytes of the signal
    ///
    /// For strings, returns UTF-8 bytes. For ABI-encoded signals, returns the encoded bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::String(s) => s.as_bytes(),
            Self::AbiEncoded(b) => b,
        }
    }

    /// Converts the signal to bytes
    #[must_use]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.as_bytes().to_vec()
    }

    /// Gets the signal as a string reference if it's a UTF-8 string
    #[must_use]
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(s) => Some(s),
            Self::AbiEncoded(_) => None,
        }
    }
}

// UniFFI exports for Signal
#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
impl Signal {
    /// Creates a signal from a string
    #[must_use]
    #[uniffi::constructor(name = "from_string")]
    pub fn ffi_from_string(s: String) -> Arc<Self> {
        Arc::new(Self::from_string(s))
    }

    /// Creates a signal from ABI-encoded bytes
    #[must_use]
    #[uniffi::constructor(name = "from_abi_encoded")]
    pub fn ffi_from_abi_encoded(bytes: Vec<u8>) -> Arc<Self> {
        Arc::new(Self::from_abi_encoded(bytes))
    }

    /// Gets the signal as raw bytes
    #[must_use]
    #[uniffi::method(name = "as_bytes")]
    pub fn ffi_as_bytes(&self) -> Vec<u8> {
        self.to_bytes()
    }

    /// Gets the signal as a string if it's a UTF-8 string signal
    #[must_use]
    #[uniffi::method(name = "as_string")]
    pub fn ffi_as_string(&self) -> Option<String> {
        self.as_str().map(String::from)
    }
}

impl Serialize for Signal {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::String(s) => serializer.serialize_str(s),
            Self::AbiEncoded(b) => serializer.serialize_str(&format!("0x{}", hex::encode(b))),
        }
    }
}

impl<'de> Deserialize<'de> for Signal {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;

        // Only decode as ABI-encoded if it has the "0x" prefix
        if let Some(stripped) = s.strip_prefix("0x") {
            if let Ok(bytes) = hex::decode(stripped) {
                return Ok(Self::AbiEncoded(bytes));
            }
        }

        // Else, treat as a UTF-8 string
        Ok(Self::String(s))
    }
}

/// A single credential request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
pub struct Request {
    /// The type of credential being requested
    #[serde(rename = "type")]
    pub credential_type: CredentialType,

    /// The signal to be included in the proof (unique per request)
    /// If `None`, no signal is included in the proof
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<Signal>,

    /// Whether face authentication is required (only valid for orb and face credentials)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub face_auth: Option<bool>,
}

impl Request {
    /// Creates a new request with an optional signal
    #[must_use]
    pub fn new(credential_type: CredentialType, signal: Option<Signal>) -> Self {
        Self {
            credential_type,
            signal,
            face_auth: None,
        }
    }

    /// Gets the signal as bytes
    #[must_use]
    pub fn signal_bytes(&self) -> Option<Vec<u8>> {
        self.signal.as_ref().map(Signal::to_bytes)
    }

    /// Adds face authentication requirement
    #[must_use]
    pub fn with_face_auth(mut self, face_auth: bool) -> Self {
        self.face_auth = Some(face_auth);
        self
    }

    /// Validates the request
    ///
    /// # Errors
    ///
    /// Returns an error if `face_auth` is set for an incompatible credential type
    pub fn validate(&self) -> crate::Result<()> {
        if self.face_auth == Some(true) {
            match self.credential_type {
                CredentialType::Orb | CredentialType::Face => Ok(()),
                _ => Err(crate::Error::InvalidConfiguration(format!(
                    "face_auth is only supported for orb and face credentials, got: {:?}",
                    self.credential_type
                ))),
            }
        } else {
            Ok(())
        }
    }
}

// UniFFI exports for Request
#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
impl Request {
    /// Creates a new credential request
    #[must_use]
    #[uniffi::constructor(name = "new")]
    pub fn ffi_new(credential_type: CredentialType, signal: Option<Arc<Signal>>) -> Arc<Self> {
        let signal_opt = signal.map(|s| (*s).clone());
        Arc::new(Self::new(credential_type, signal_opt))
    }

    /// Sets the face authentication requirement on a request
    #[must_use]
    #[uniffi::method(name = "with_face_auth")]
    pub fn ffi_with_face_auth(&self, face_auth: bool) -> Arc<Self> {
        Arc::new(self.clone().with_face_auth(face_auth))
    }

    /// Gets the signal as raw bytes from a request
    #[must_use]
    pub fn get_signal_bytes(&self) -> Option<Vec<u8>> {
        self.signal_bytes()
    }

    /// Gets the credential type
    #[must_use]
    pub fn credential_type(&self) -> CredentialType {
        self.credential_type
    }

    /// Gets the face_auth setting
    #[must_use]
    pub fn face_auth(&self) -> Option<bool> {
        self.face_auth
    }

    /// Serializes a request to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON serialization fails
    pub fn to_json(&self) -> std::result::Result<String, crate::error::IdkitError> {
        serde_json::to_string(&self)
            .map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
    }

    /// Deserializes a request from JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON deserialization fails
    #[uniffi::constructor(name = "from_json")]
    pub fn ffi_from_json(json: &str) -> std::result::Result<Arc<Self>, crate::error::IdkitError> {
        serde_json::from_str(json)
            .map(Arc::new)
            .map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
    }
}

/// The proof of verification returned by the World ID protocol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct Proof {
    /// The Zero-knowledge proof of the verification (hex string, ABI encoded)
    pub proof: String,

    /// Hash pointer to the root of the Merkle tree (hex string, ABI encoded)
    pub merkle_root: String,

    /// User's unique identifier for the app and action (hex string, ABI encoded)
    pub nullifier_hash: String,

    /// The verification level used to generate the proof
    pub verification_level: CredentialType,
}

// UniFFI helper functions for Proof
#[cfg(feature = "ffi")]
/// Serializes a proof to JSON
///
/// # Errors
///
/// Returns an error if JSON serialization fails
#[uniffi::export]
pub fn proof_to_json(proof: &Proof) -> std::result::Result<String, crate::error::IdkitError> {
    serde_json::to_string(proof).map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
}

#[cfg(feature = "ffi")]
/// Deserializes a proof from JSON
///
/// # Errors
///
/// Returns an error if JSON deserialization fails
#[uniffi::export]
pub fn proof_from_json(json: &str) -> std::result::Result<Proof, crate::error::IdkitError> {
    serde_json::from_str(json).map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
}

/// Application ID for World ID
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppId(String);

impl AppId {
    /// Creates a new `AppId`
    ///
    /// # Errors
    ///
    /// Returns an error if the `app_id` doesn't start with "app_"
    pub fn new(app_id: impl Into<String>) -> crate::Result<Self> {
        let app_id = app_id.into();
        if !app_id.starts_with("app_") {
            return Err(crate::Error::InvalidConfiguration(
                "app_id must start with 'app_'".to_string(),
            ));
        }
        Ok(Self(app_id))
    }

    /// Returns true if this is a staging app ID
    #[must_use]
    pub fn is_staging(&self) -> bool {
        self.0.starts_with("app_staging_")
    }

    /// Returns the raw app ID string
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for AppId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Bridge URL for connecting to the World App
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BridgeUrl(String);

impl BridgeUrl {
    /// Default bridge URL
    pub const DEFAULT: &'static str = "https://bridge.worldcoin.org";

    /// Creates a new bridge URL
    ///
    /// # Errors
    ///
    /// Returns an error if the URL is invalid
    pub fn new(url: impl Into<String>) -> crate::Result<Self> {
        let url = url.into();
        // Validate it's a valid URL
        url::Url::parse(&url)
            .map_err(|e| crate::Error::InvalidConfiguration(format!("Invalid bridge URL: {e}")))?;
        Ok(Self(url))
    }

    /// Returns the URL as a string
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Joins a path to the bridge URL
    ///
    /// # Errors
    ///
    /// Returns an error if the path cannot be joined
    pub fn join(&self, path: &str) -> crate::Result<url::Url> {
        let base = url::Url::parse(&self.0)
            .map_err(|e| crate::Error::InvalidConfiguration(format!("Invalid bridge URL: {e}")))?;
        base.join(path)
            .map_err(|e| crate::Error::InvalidConfiguration(format!("Failed to join path: {e}")))
    }
}

impl Default for BridgeUrl {
    fn default() -> Self {
        Self(Self::DEFAULT.to_string())
    }
}

impl Serialize for BridgeUrl {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for BridgeUrl {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Self::new(s).map_err(serde::de::Error::custom)
    }
}

/// Verification level (for backward compatibility)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum VerificationLevel {
    /// Orb-only verification
    Orb,
    /// Face or Orb verification
    Face,
    /// Device verification (orb or device)
    Device,
    /// Document verification (any document type or orb)
    Document,
    /// Secure document verification (secure document or orb)
    SecureDocument,
}

impl VerificationLevel {
    /// Converts a verification level to a list of credential types in priority order
    #[must_use]
    pub fn to_credentials(&self) -> Vec<CredentialType> {
        match self {
            Self::Orb => vec![CredentialType::Orb],
            Self::Face => vec![CredentialType::Orb, CredentialType::Face],
            Self::Device => vec![CredentialType::Orb, CredentialType::Device],
            Self::SecureDocument => vec![CredentialType::Orb, CredentialType::SecureDocument],
            Self::Document => vec![
                CredentialType::Orb,
                CredentialType::SecureDocument,
                CredentialType::Document,
            ],
        }
    }
}

// UniFFI helper function for CredentialType
#[cfg(feature = "ffi")]
/// Gets the string representation of a credential type
#[must_use]
#[uniffi::export]
pub fn credential_to_string(credential: &CredentialType) -> String {
    credential.as_str().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_id_validation() {
        assert!(AppId::new("app_123").is_ok());
        assert!(AppId::new("app_staging_456").is_ok());
        assert!(AppId::new("invalid").is_err());
    }

    #[test]
    fn test_app_id_staging() {
        let staging = AppId::new("app_staging_123").unwrap();
        assert!(staging.is_staging());

        let prod = AppId::new("app_123").unwrap();
        assert!(!prod.is_staging());
    }

    #[test]
    fn test_request_validation() {
        let valid = Request::new(CredentialType::Orb, Some(Signal::from_string("signal")))
            .with_face_auth(true);
        assert!(valid.validate().is_ok());

        let invalid = Request::new(CredentialType::Device, Some(Signal::from_string("signal")))
            .with_face_auth(true);
        assert!(invalid.validate().is_err());

        // Test without signal
        let no_signal = Request::new(CredentialType::Face, None);
        assert!(no_signal.validate().is_ok());
        assert_eq!(no_signal.signal, None);
    }

    #[test]
    fn test_request_with_abi_encoded_signal() {
        // Test creating request with ABI-encoded bytes
        let bytes = b"arbitrary\x00\xFF\xFE data";
        let request = Request::new(CredentialType::Orb, Some(Signal::from_abi_encoded(bytes)));

        // Verify signal is stored as ABI-encoded
        assert!(request.signal.is_some());
        let signal = request.signal.as_ref().unwrap();
        assert_eq!(signal, &Signal::from_abi_encoded(bytes));

        // Verify we can decode back to bytes
        let decoded = request.signal_bytes().unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn test_request_with_string_signal() {
        // Test creating request with string signal
        let request = Request::new(CredentialType::Face, Some(Signal::from_string("my_signal")));
        assert_eq!(request.signal, Some(Signal::from_string("my_signal")));

        // String signals should also be retrievable as bytes
        let bytes = request.signal_bytes().unwrap();
        assert_eq!(bytes, b"my_signal");
    }

    #[test]
    fn test_request_without_signal() {
        let request = Request::new(CredentialType::Device, None);
        assert_eq!(request.signal, None);
        assert_eq!(request.signal_bytes(), None);
    }

    #[test]
    fn test_signal_serialization() {
        // Test string signal serialization
        let signal = Signal::from_string("test_signal");
        let json = serde_json::to_string(&signal).unwrap();
        assert_eq!(json, r#""test_signal""#);

        // Test ABI-encoded signal serialization (hex-encoded with 0x prefix)
        let abi_signal = Signal::from_abi_encoded(vec![0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello" bytes
        let json = serde_json::to_string(&abi_signal).unwrap();
        assert_eq!(json, r#""0x48656c6c6f""#);
    }

    #[test]
    fn test_signal_deserialization() {
        // Test 0x-prefixed hex deserialization (treated as ABI-encoded)
        let signal: Signal = serde_json::from_str(r#""0x48656c6c6f""#).unwrap();
        assert_eq!(signal.as_bytes(), b"Hello");
        assert!(matches!(signal, Signal::AbiEncoded(_)));

        // Test non-prefixed hex is treated as a plain string (not ABI-encoded)
        // This prevents ambiguity with strings like "cafe" or "deadbeef"
        let signal: Signal = serde_json::from_str(r#""48656c6c6f""#).unwrap();
        assert_eq!(signal.as_str(), Some("48656c6c6f"));
        assert!(matches!(signal, Signal::String(_)));

        // Test UTF-8 string deserialization
        let signal: Signal = serde_json::from_str(r#""plaintext""#).unwrap();
        assert_eq!(signal.as_str(), Some("plaintext"));
        assert_eq!(signal.as_bytes(), b"plaintext");
        assert!(matches!(signal, Signal::String(_)));

        // Test that ambiguous hex strings like "cafe" are treated as strings
        let signal: Signal = serde_json::from_str(r#""cafe""#).unwrap();
        assert_eq!(signal.as_str(), Some("cafe"));
        assert!(matches!(signal, Signal::String(_)));
    }

    #[test]
    fn test_credential_serialization() {
        let cred = CredentialType::Orb;
        let json = serde_json::to_string(&cred).unwrap();
        assert_eq!(json, r#""orb""#);

        let deserialized: CredentialType = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, CredentialType::Orb);
    }

    #[test]
    fn test_verification_level_to_credentials() {
        assert_eq!(
            VerificationLevel::Orb.to_credentials(),
            vec![CredentialType::Orb]
        );

        assert_eq!(
            VerificationLevel::Device.to_credentials(),
            vec![CredentialType::Orb, CredentialType::Device]
        );

        assert_eq!(
            VerificationLevel::Document.to_credentials(),
            vec![
                CredentialType::Orb,
                CredentialType::SecureDocument,
                CredentialType::Document
            ]
        );
    }
}
