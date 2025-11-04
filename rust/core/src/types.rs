//! Core types for the `IDKit` protocol

use serde::{Deserialize, Serialize};

/// Credential types that can be requested
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum Credential {
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

impl Credential {
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

/// A signal value that can be either UTF-8 string or arbitrary bytes
///
/// Signals are used to create unique proofs. They can be:
/// - UTF-8 strings (common case)
/// - Arbitrary bytes hex-encoded (for on-chain use cases)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Signal {
    /// UTF-8 string signal
    String(String),
    /// Arbitrary bytes, stored as hex for JSON compatibility
    Bytes(Vec<u8>),
}

impl Signal {
    /// Creates a signal from a string
    #[must_use]
    pub fn from_string(s: impl Into<String>) -> Self {
        Self::String(s.into())
    }

    /// Creates a signal from arbitrary bytes
    #[must_use]
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Self {
        Self::Bytes(bytes.into())
    }

    /// Gets the signal as bytes
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::String(s) => s.as_bytes(),
            Self::Bytes(b) => b,
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
            Self::Bytes(_) => None,
        }
    }
}

impl Serialize for Signal {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::String(s) => serializer.serialize_str(s),
            Self::Bytes(b) => serializer.serialize_str(&hex::encode(b)),
        }
    }
}

impl<'de> Deserialize<'de> for Signal {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;

        // Try to decode as hex first (0x-prefixed or plain hex)
        if let Some(stripped) = s.strip_prefix("0x") {
            if let Ok(bytes) = hex::decode(stripped) {
                return Ok(Self::Bytes(bytes));
            }
        } else if let Ok(bytes) = hex::decode(&s) {
            return Ok(Self::Bytes(bytes));
        }

        // Fall back to UTF-8 string
        Ok(Self::String(s))
    }
}

/// A single credential request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    /// The type of credential being requested
    #[serde(rename = "type")]
    pub credential_type: Credential,

    /// The signal to be included in the proof (unique per request)
    /// If `None`, no signal is included in the proof
    ///
    /// Note: When using `UniFFI` bindings, this field is not exposed directly.
    /// Use the provided accessor functions in the bindings layer instead.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<Signal>,

    /// Whether face authentication is required (only valid for orb and face credentials)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub face_auth: Option<bool>,
}

impl Request {
    /// Creates a new request with an optional signal
    #[must_use]
    pub const fn new(credential_type: Credential, signal: Option<Signal>) -> Self {
        Self {
            credential_type,
            signal,
            face_auth: None,
        }
    }

    /// Creates a new request with a signal from arbitrary bytes
    ///
    /// The bytes are hex-encoded for storage and transmission.
    /// This is useful for on-chain use cases where RPs need custom encoding.
    #[must_use]
    pub fn with_signal_bytes(credential_type: Credential, signal_bytes: &[u8]) -> Self {
        Self {
            credential_type,
            signal: Some(Signal::from_bytes(signal_bytes)),
            face_auth: None,
        }
    }

    /// Creates a new request with a string signal
    #[must_use]
    pub fn with_signal(credential_type: Credential, signal: impl Into<String>) -> Self {
        Self {
            credential_type,
            signal: Some(Signal::from_string(signal)),
            face_auth: None,
        }
    }

    /// Creates a new request without a signal
    #[must_use]
    pub const fn without_signal(credential_type: Credential) -> Self {
        Self {
            credential_type,
            signal: None,
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
    pub const fn with_face_auth(mut self, face_auth: bool) -> Self {
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
                Credential::Orb | Credential::Face => Ok(()),
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

/// The proof of verification returned by the World ID protocol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Record))]
pub struct Proof {
    /// The Zero-knowledge proof of the verification (hex string, ABI encoded)
    pub proof: String,

    /// Hash pointer to the root of the Merkle tree (hex string, ABI encoded)
    pub merkle_root: String,

    /// User's unique identifier for the app and action (hex string, ABI encoded)
    pub nullifier_hash: String,

    /// The verification level used
    pub verification_level: Credential,
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
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum VerificationLevel {
    /// Orb-only verification
    Orb,
    /// TODO(gabe) should we include face in verification levels?
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
    pub fn to_credentials(&self) -> Vec<Credential> {
        match self {
            Self::Orb => vec![Credential::Orb],
            Self::Face => vec![Credential::Orb, Credential::Face],
            Self::Device => vec![Credential::Orb, Credential::Device],
            Self::SecureDocument => vec![Credential::Orb, Credential::SecureDocument],
            Self::Document => vec![
                Credential::Orb,
                Credential::SecureDocument,
                Credential::Document,
            ],
        }
    }
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
        let valid = Request::new(Credential::Orb, Some(Signal::from_string("signal"))).with_face_auth(true);
        assert!(valid.validate().is_ok());

        let invalid = Request::new(Credential::Device, Some(Signal::from_string("signal"))).with_face_auth(true);
        assert!(invalid.validate().is_err());

        // Test without signal
        let no_signal = Request::new(Credential::Face, None);
        assert!(no_signal.validate().is_ok());
        assert_eq!(no_signal.signal, None);
    }

    #[test]
    fn test_request_with_signal_bytes() {
        // Test creating request with arbitrary bytes
        let bytes = b"arbitrary\x00\xFF\xFE data";
        let request = Request::with_signal_bytes(Credential::Orb, bytes);

        // Verify signal is stored as bytes
        assert!(request.signal.is_some());
        let signal = request.signal.as_ref().unwrap();
        assert_eq!(signal, &Signal::from_bytes(bytes));

        // Verify we can decode back to bytes
        let decoded = request.signal_bytes().unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn test_request_with_string_signal() {
        // Test creating request with string signal
        let request = Request::with_signal(Credential::Face, "my_signal");
        assert_eq!(request.signal, Some(Signal::from_string("my_signal")));

        // String signals should also be retrievable as bytes
        let bytes = request.signal_bytes().unwrap();
        assert_eq!(bytes, b"my_signal");
    }

    #[test]
    fn test_request_without_signal() {
        let request = Request::without_signal(Credential::Device);
        assert_eq!(request.signal, None);
        assert_eq!(request.signal_bytes(), None);
    }

    #[test]
    fn test_signal_serialization() {
        // Test string signal serialization
        let signal = Signal::from_string("test_signal");
        let json = serde_json::to_string(&signal).unwrap();
        assert_eq!(json, r#""test_signal""#);

        // Test bytes signal serialization (hex-encoded)
        let bytes_signal = Signal::from_bytes(vec![0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
        let json = serde_json::to_string(&bytes_signal).unwrap();
        assert_eq!(json, r#""48656c6c6f""#);
    }

    #[test]
    fn test_signal_deserialization() {
        // Test 0x-prefixed hex deserialization
        let signal: Signal = serde_json::from_str(r#""0x48656c6c6f""#).unwrap();
        assert_eq!(signal.as_bytes(), b"Hello");

        // Test non-prefixed hex deserialization
        let signal: Signal = serde_json::from_str(r#""48656c6c6f""#).unwrap();
        assert_eq!(signal.as_bytes(), b"Hello");

        // Test UTF-8 string deserialization (fallback)
        let signal: Signal = serde_json::from_str(r#""plaintext""#).unwrap();
        assert_eq!(signal.as_str(), Some("plaintext"));
        assert_eq!(signal.as_bytes(), b"plaintext");
    }

    #[test]
    fn test_credential_serialization() {
        let cred = Credential::Orb;
        let json = serde_json::to_string(&cred).unwrap();
        assert_eq!(json, r#""orb""#);

        let deserialized: Credential = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, Credential::Orb);
    }

    #[test]
    fn test_verification_level_to_credentials() {
        assert_eq!(
            VerificationLevel::Orb.to_credentials(),
            vec![Credential::Orb]
        );

        assert_eq!(
            VerificationLevel::Device.to_credentials(),
            vec![Credential::Orb, Credential::Device]
        );

        assert_eq!(
            VerificationLevel::Document.to_credentials(),
            vec![
                Credential::Orb,
                Credential::SecureDocument,
                Credential::Document
            ]
        );
    }
}
