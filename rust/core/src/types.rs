//! Core types for the `IDKit` protocol

use serde::{Deserialize, Serialize};
use world_id_primitives::rp::RpId;

use std::str::FromStr;

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

    /// Creates a `CredentialType` from an issuer schema ID
    ///
    /// Returns `None` if the ID doesn't map to a known credential type.
    #[must_use]
    pub const fn from_issuer_schema_id(id: u64) -> Option<Self> {
        match id {
            1 => Some(Self::Orb),
            2 => Some(Self::Face),
            3 => Some(Self::SecureDocument),
            4 => Some(Self::Document),
            5 => Some(Self::Device),
            _ => None,
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
// TODO: Unify on a signal type that makes sense for both protocol
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

/// A credential request item
///
/// Represents a single credential type that can be requested, with optional
/// signal and genesis timestamp constraints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
pub struct CredentialRequest {
    /// The type of credential being requested
    #[serde(rename = "type")]
    pub credential_type: CredentialType,

    /// The signal to be included in the proof (unique per request)
    /// If `None`, no signal is included in the proof
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<Signal>,

    /// Optional minimum genesis timestamp constraint
    /// Only credentials issued at or after this timestamp will be accepted
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genesis_issued_at_min: Option<u64>,
}

impl CredentialRequest {
    /// Creates a new credential request with an optional signal
    #[must_use]
    pub fn new(credential_type: CredentialType, signal: Option<Signal>) -> Self {
        Self {
            credential_type,
            signal,
            genesis_issued_at_min: None,
        }
    }

    /// Creates a new request item with a genesis timestamp constraint
    #[must_use]
    pub fn with_genesis_min(
        credential_type: CredentialType,
        signal: Option<Signal>,
        genesis_min: u64,
    ) -> Self {
        Self {
            credential_type,
            signal,
            genesis_issued_at_min: Some(genesis_min),
        }
    }

    /// Gets the signal as bytes
    #[must_use]
    pub fn signal_bytes(&self) -> Option<Vec<u8>> {
        self.signal.as_ref().map(Signal::to_bytes)
    }

    /// Converts to a protocol `CredentialRequest`
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type cannot be mapped to an issuer schema ID
    pub fn to_protocol_item(&self) -> crate::Result<crate::protocol_types::CredentialRequest> {
        use crate::issuer_schema::credential_to_issuer_schema_id;

        let identifier = self.credential_type.as_str().to_string();
        let issuer_schema_id = credential_to_issuer_schema_id(&identifier).ok_or_else(|| {
            crate::Error::InvalidConfiguration(format!("Unknown credential type: {identifier}"))
        })?;

        // Encode signal if present
        let signal = self.signal.as_ref().map(crate::crypto::encode_signal);

        Ok(crate::protocol_types::CredentialRequest::new(
            identifier,
            issuer_schema_id,
            signal,
            self.genesis_issued_at_min,
        ))
    }
}

// UniFFI exports for CredentialRequest
#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
impl CredentialRequest {
    /// Creates a new credential request item
    #[must_use]
    #[uniffi::constructor(name = "new")]
    pub fn ffi_new(credential_type: CredentialType, signal: Option<Arc<Signal>>) -> Arc<Self> {
        let signal_opt = signal.map(|s| (*s).clone());
        Arc::new(Self::new(credential_type, signal_opt))
    }

    /// Creates a new credential request item with an optional string signal.
    ///
    /// This is a convenience constructor that accepts a string signal directly,
    /// converting it to a Signal internally. Generates a proper Swift initializer.
    #[must_use]
    #[uniffi::constructor]
    pub fn with_string_signal(
        credential_type: CredentialType,
        signal: Option<String>,
    ) -> Arc<Self> {
        let signal_opt = signal.map(Signal::from_string);
        Arc::new(Self::new(credential_type, signal_opt))
    }

    /// Creates a new credential request item with a genesis timestamp constraint
    #[must_use]
    #[uniffi::constructor(name = "with_genesis_min")]
    pub fn ffi_with_genesis_min(
        credential_type: CredentialType,
        signal: Option<Arc<Signal>>,
        genesis_min: u64,
    ) -> Arc<Self> {
        let signal_opt = signal.map(|s| (*s).clone());
        Arc::new(Self::with_genesis_min(
            credential_type,
            signal_opt,
            genesis_min,
        ))
    }

    /// Gets the signal as raw bytes from a request item
    #[must_use]
    pub fn get_signal_bytes(&self) -> Option<Vec<u8>> {
        self.signal_bytes()
    }

    /// Gets the credential type
    #[must_use]
    pub fn credential_type(&self) -> CredentialType {
        self.credential_type
    }

    /// Gets the genesis timestamp constraint
    #[must_use]
    pub fn genesis_issued_at_min(&self) -> Option<u64> {
        self.genesis_issued_at_min
    }

    /// Serializes a request item to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON serialization fails
    pub fn to_json(&self) -> std::result::Result<String, crate::error::IdkitError> {
        serde_json::to_string(&self)
            .map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
    }

    /// Deserializes a request item from JSON
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

/// Legacy bridge response (protocol v1 / World ID v3)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct BridgeResponseV1 {
    /// The Zero-knowledge proof of the verification (hex string, ABI encoded)
    pub proof: String,

    /// Hash pointer to the root of the Merkle tree (hex string, ABI encoded)
    pub merkle_root: String,

    /// User's unique identifier for the app and action (hex string, ABI encoded)
    pub nullifier_hash: String,

    /// The verification level used to generate the proof
    pub verification_level: CredentialType,
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Response Types (World ID 4.0)
// ─────────────────────────────────────────────────────────────────────────────

/// A single credential response item for uniqueness proofs
///
/// V4 is detected by presence of `proof_timestamp`/`issuer_schema_id`.
/// V3 is detected by presence of `nullifier_hash`.
/// Session is detected by presence of `session_nullifier`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(untagged)]
pub enum ResponseItem {
    /// Protocol version 4.0 (World ID v4)
    V4 {
        /// Credential identifier (maps to `CredentialType`)
        identifier: CredentialType,
        /// Compressed Groth16 proof (hex string)
        proof: String,
        /// RP-scoped nullifier (hex string)
        nullifier: String,
        /// Authenticator merkle root (hex string)
        merkle_root: String,
        /// Unix timestamp when proof was generated
        proof_timestamp: u64,
        /// Credential issuer schema ID (hex string)
        issuer_schema_id: String,
    },
    /// Protocol version 3.0 (World ID v3 - legacy format)
    V3 {
        /// Credential identifier (same as `verification_level`)
        identifier: CredentialType,
        /// ABI-encoded proof (hex string)
        proof: String,
        /// Merkle root (hex string)
        merkle_root: String,
        /// Nullifier hash (hex string)
        nullifier_hash: String,
    },
    /// Session proof (World ID v4 sessions)
    Session {
        /// Credential identifier (maps to `CredentialType`)
        identifier: CredentialType,
        /// Compressed Groth16 proof (hex string)
        proof: String,
        /// Session nullifier (hex string)
        session_nullifier: String,
        /// Authenticator merkle root (hex string)
        merkle_root: String,
        /// Unix timestamp when proof was generated
        proof_timestamp: u64,
        /// Credential issuer schema ID (hex string)
        issuer_schema_id: String,
    },
}

impl ResponseItem {
    /// Gets the credential identifier regardless of protocol version
    #[must_use]
    pub const fn identifier(&self) -> CredentialType {
        match self {
            Self::V4 { identifier, .. }
            | Self::V3 { identifier, .. }
            | Self::Session { identifier, .. } => *identifier,
        }
    }

    /// Gets the nullifier value regardless of protocol version
    ///
    /// For V4 responses, returns the nullifier.
    /// For V3 responses, returns the `nullifier_hash`.
    /// For Session responses, returns the `session_nullifier`.
    #[must_use]
    pub fn nullifier(&self) -> &str {
        match self {
            Self::V4 { nullifier, .. } => nullifier,
            Self::V3 { nullifier_hash, .. } => nullifier_hash,
            Self::Session {
                session_nullifier, ..
            } => session_nullifier,
        }
    }

    /// Gets the merkle root regardless of protocol version
    #[must_use]
    pub fn merkle_root(&self) -> &str {
        match self {
            Self::V4 { merkle_root, .. }
            | Self::V3 { merkle_root, .. }
            | Self::Session { merkle_root, .. } => merkle_root,
        }
    }

    /// Gets the proof string regardless of protocol version
    #[must_use]
    pub fn proof(&self) -> &str {
        match self {
            Self::V4 { proof, .. } | Self::V3 { proof, .. } | Self::Session { proof, .. } => proof,
        }
    }

    /// Returns true if this is a session response
    #[must_use]
    pub const fn is_session(&self) -> bool {
        matches!(self, Self::Session { .. })
    }
}

/// This is the top-level result returned from a proof request flow.
/// It contains the protocol version and an array of credential responses.
/// For session proofs, it also contains the `session_id`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct IDKitResult {
    /// Protocol version ("v4" or "v3") - applies to all responses
    pub protocol_version: String,

    /// Session ID (only present for session proofs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    /// Array of credential responses (always successful - errors at `BridgeResponse` level)
    pub responses: Vec<ResponseItem>,
}

impl IDKitResult {
    /// Creates a new `IDKitResult` with protocol version and responses (no session)
    #[must_use]
    pub fn new(protocol_version: impl Into<String>, responses: Vec<ResponseItem>) -> Self {
        Self {
            protocol_version: protocol_version.into(),
            session_id: None,
            responses,
        }
    }

    /// Creates a new `IDKitResult` for a session proof with session ID and responses
    #[must_use]
    pub fn new_session(session_id: String, responses: Vec<ResponseItem>) -> Self {
        Self {
            protocol_version: "4.0".to_string(),
            session_id: Some(session_id),
            responses,
        }
    }

    /// Returns true if this is a session result
    #[must_use]
    pub const fn is_session(&self) -> bool {
        self.session_id.is_some()
    }
}

// UniFFI helper functions for IDKitResult
#[cfg(feature = "ffi")]
/// Serializes an `IDKitResult` to JSON
///
/// # Errors
///
/// Returns an error if JSON serialization fails
#[uniffi::export]
pub fn idkit_result_to_json(
    result: &IDKitResult,
) -> std::result::Result<String, crate::error::IdkitError> {
    serde_json::to_string(result).map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
}

#[cfg(feature = "ffi")]
/// Deserializes an `IDKitResult` from JSON
///
/// # Errors
///
/// Returns an error if JSON deserialization fails
#[uniffi::export]
pub fn idkit_result_from_json(
    json: &str,
) -> std::result::Result<IDKitResult, crate::error::IdkitError> {
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

    /// Creates a new bridge URL with validation based on app context
    ///
    /// For staging apps (`app_staging_*`), allows localhost/127.0.0.1 with relaxed rules.
    /// For production apps, enforces strict validation:
    /// - Must use HTTPS
    /// - Must use default port (443)
    /// - Must not have a path, query parameters, or fragment
    ///
    /// # Errors
    ///
    /// Returns an error if validation fails
    pub fn new(url: impl Into<String>, app_id: &AppId) -> crate::Result<Self> {
        Self::validated(url.into(), app_id.is_staging())
    }

    /// Creates a bridge URL with strict production validation
    ///
    /// Use this when no `AppId` is available (e.g., deserialization).
    /// Always applies strict validation rules.
    ///
    /// # Errors
    ///
    /// Returns an error if validation fails
    pub fn new_strict(url: impl Into<String>) -> crate::Result<Self> {
        Self::validated(url.into(), false)
    }

    /// Internal validation with explicit staging flag
    fn validated(url: String, is_staging: bool) -> crate::Result<Self> {
        let parsed = url::Url::parse(&url).map_err(|e| {
            crate::Error::InvalidConfiguration(format!("Failed to parse Bridge URL: {e}"))
        })?;

        let is_localhost = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1"));

        // Staging localhost: skip all validation
        if is_staging && is_localhost {
            return Ok(Self(url));
        }

        // Collect all validation errors
        let mut errors = Vec::new();

        if parsed.scheme() != "https" {
            errors.push("Bridge URL must use HTTPS.");
        }
        if parsed.port().is_some() {
            errors.push("Bridge URL must use the default port (443).");
        }
        if !matches!(parsed.path(), "/" | "") {
            errors.push("Bridge URL must not have a path.");
        }
        if parsed.query().is_some() {
            errors.push("Bridge URL must not have query parameters.");
        }
        if parsed.fragment().is_some() {
            errors.push("Bridge URL must not have a fragment.");
        }

        if !errors.is_empty() {
            return Err(crate::Error::InvalidConfiguration(errors.join(" ")));
        }

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
        Self::new_strict(s).map_err(serde::de::Error::custom)
    }
}

/// Relying Party context for protocol-level proof requests
///
/// Contains the RP-specific data needed to construct a `ProofRequest`.
/// This includes timing information, nonce, and the RP's signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
// TODO: use primitive types for rp context
pub struct RpContext {
    /// The registered RP ID (e.g., `rp_123456789abcdef0`)
    pub rp_id: RpId,
    /// Unique nonce for this proof request used in the signature
    pub nonce: String,
    /// Unix timestamp (seconds since epoch) used in the signature
    pub created_at: u64,
    /// Unix timestamp (seconds since epoch) when the proof request expires
    pub expires_at: u64,
    /// The RP's ECDSA signature of the `nonce` and `created_at` timestamp
    pub signature: String,
}

// Validate created_at is not in the future (with 60s tolerance for clock skew)
const CLOCK_SKEW_ALLOWANCE_SECS: u64 = 60;

impl RpContext {
    /// Creates a new RP context
    ///
    /// # Errors
    ///
    /// Returns an error if `rp_id` is not a valid RP ID (must start with `rp_`)
    pub fn new(
        rp_id: impl AsRef<str>,
        nonce: impl Into<String>,
        created_at: u64,
        expires_at: u64,
        signature: impl Into<String>,
    ) -> crate::Result<Self> {
        let rp_id = RpId::from_str(rp_id.as_ref()).map_err(|_| {
            crate::Error::InvalidConfiguration("Invalid RP ID: must start with 'rp_'".to_string())
        })?;

        #[cfg(not(target_arch = "wasm32"))]
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        #[cfg(target_arch = "wasm32")]
        let now = (js_sys::Date::now() / 1000.0) as u64;
        if created_at > now + CLOCK_SKEW_ALLOWANCE_SECS {
            return Err(crate::Error::InvalidConfiguration(
                "created_at cannot be in the future".to_string(),
            ));
        }

        // Validate expires_at is after created_at
        if created_at >= expires_at {
            return Err(crate::Error::InvalidConfiguration(
                "expires_at must be greater than created_at".to_string(),
            ));
        }

        Ok(Self {
            rp_id,
            nonce: nonce.into(),
            created_at,
            expires_at,
            signature: signature.into(),
        })
    }

    /// Returns true if the context is expired
    #[must_use]
    pub const fn is_expired(&self, now: u64) -> bool {
        now > self.expires_at
    }

    /// Returns the RP ID
    #[must_use]
    pub fn rp_id(&self) -> &RpId {
        &self.rp_id
    }
}

// UniFFI exports for RpContext
#[cfg(feature = "ffi")]
#[uniffi::export]
impl RpContext {
    /// Creates a new RP context
    ///
    /// # Errors
    ///
    /// Returns an error if `rp_id` is not a valid RP ID
    #[uniffi::constructor(name = "new")]
    pub fn ffi_new(
        rp_id: String,
        nonce: String,
        created_at: u64,
        expires_at: u64,
        signature: String,
    ) -> std::result::Result<Arc<Self>, crate::error::IdkitError> {
        Ok(Arc::new(Self::new(
            rp_id, nonce, created_at, expires_at, signature,
        )?))
    }

    /// Gets the RP ID as a string
    #[must_use]
    #[uniffi::method(name = "rp_id")]
    pub fn ffi_rp_id(&self) -> String {
        self.rp_id.to_string()
    }

    /// Gets the nonce
    #[must_use]
    #[uniffi::method(name = "nonce")]
    pub fn ffi_nonce(&self) -> String {
        self.nonce.clone()
    }

    /// Gets the `created_at` timestamp
    #[must_use]
    #[uniffi::method(name = "created_at")]
    pub fn ffi_created_at(&self) -> u64 {
        self.created_at
    }

    /// Gets the `expires_at` timestamp
    #[must_use]
    #[uniffi::method(name = "expires_at")]
    pub fn ffi_expires_at(&self) -> u64 {
        self.expires_at
    }

    /// Gets the signature
    #[must_use]
    #[uniffi::method(name = "signature")]
    pub fn ffi_signature(&self) -> String {
        self.signature.clone()
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
    /// Invalid verification level (used to signal World App 4.0+ only)
    ///
    /// When this is sent, older World App versions will reject the request
    /// with an error, ensuring only 4.0+ versions can process the request.
    Deprecated,
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
    fn test_request_item_creation() {
        let item = CredentialRequest::new(CredentialType::Orb, Some(Signal::from_string("signal")));
        assert_eq!(item.credential_type, CredentialType::Orb);
        assert_eq!(item.signal, Some(Signal::from_string("signal")));
        assert_eq!(item.genesis_issued_at_min, None);

        // Test without signal
        let no_signal = CredentialRequest::new(CredentialType::Face, None);
        assert_eq!(no_signal.signal, None);
    }

    #[test]
    fn test_request_item_with_genesis_min() {
        let item = CredentialRequest::with_genesis_min(
            CredentialType::Orb,
            Some(Signal::from_string("signal")),
            1_700_000_000,
        );
        assert_eq!(item.credential_type, CredentialType::Orb);
        assert_eq!(item.genesis_issued_at_min, Some(1_700_000_000));
    }

    #[test]
    fn test_request_item_with_abi_encoded_signal() {
        // Test creating request item with ABI-encoded bytes
        let bytes = b"arbitrary\x00\xFF\xFE data";
        let item =
            CredentialRequest::new(CredentialType::Orb, Some(Signal::from_abi_encoded(bytes)));

        // Verify signal is stored as ABI-encoded
        assert!(item.signal.is_some());
        let signal = item.signal.as_ref().unwrap();
        assert_eq!(signal, &Signal::from_abi_encoded(bytes));

        // Verify we can decode back to bytes
        let decoded = item.signal_bytes().unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn test_request_item_with_string_signal() {
        // Test creating request item with string signal
        let item =
            CredentialRequest::new(CredentialType::Face, Some(Signal::from_string("my_signal")));
        assert_eq!(item.signal, Some(Signal::from_string("my_signal")));

        // String signals should also be retrievable as bytes
        let bytes = item.signal_bytes().unwrap();
        assert_eq!(bytes, b"my_signal");
    }

    #[test]
    fn test_request_item_without_signal() {
        let item = CredentialRequest::new(CredentialType::Device, None);
        assert_eq!(item.signal, None);
        assert_eq!(item.signal_bytes(), None);
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
    fn test_rp_context_creation() {
        let ctx = RpContext::new(
            "rp_123456789abcdef0",
            "unique-nonce-123",
            1000,
            2000,
            "ecdsa-signature",
        )
        .unwrap();

        assert_eq!(ctx.rp_id().to_string(), "rp_123456789abcdef0");
        assert_eq!(ctx.nonce, "unique-nonce-123");
        assert_eq!(ctx.created_at, 1000);
        assert_eq!(ctx.expires_at, 2000);
        assert_eq!(ctx.signature, "ecdsa-signature");
    }

    #[test]
    fn test_rp_context_invalid_rp_id() {
        let result = RpContext::new("invalid_rp_id", "nonce", 1000, 2000, "sig");
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert!(err.to_string().contains("Invalid RP ID"));
    }

    #[test]
    fn test_rp_context_expiration() {
        let ctx = RpContext::new("rp_0000000000000001", "nonce", 1000, 2000, "sig").unwrap();

        assert!(!ctx.is_expired(1500)); // Within validity
        assert!(!ctx.is_expired(2000)); // At expiry (not expired yet)
        assert!(ctx.is_expired(2001)); // After expiry
    }

    #[test]
    fn test_rp_context_serialization() {
        let ctx = RpContext::new("rp_0000000000000001", "nonce", 1000, 2000, "sig").unwrap();

        let json = serde_json::to_string(&ctx).unwrap();
        assert!(json.contains("rp_0000000000000001"));
        assert!(json.contains("nonce"));
        assert!(json.contains("1000"));
        assert!(json.contains("2000"));

        let deserialized: RpContext = serde_json::from_str(&json).unwrap();
        assert_eq!(ctx, deserialized);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ResponseItem tests (uniqueness proof requests)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_response_item_v4() {
        let item = ResponseItem::V4 {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            nullifier: "0xnullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        };

        assert!(matches!(item, ResponseItem::V4 { .. }));
        assert_eq!(item.identifier(), CredentialType::Orb);
        assert_eq!(item.nullifier(), "0xnullifier");
        assert_eq!(item.merkle_root(), "0xroot");
        assert_eq!(item.proof(), "0xproof");
    }

    #[test]
    fn test_response_item_v3() {
        let item = ResponseItem::V3 {
            identifier: CredentialType::Face,
            proof: "0xlegacy_proof".to_string(),
            merkle_root: "0xlegacy_root".to_string(),
            nullifier_hash: "0xlegacy_nullifier".to_string(),
        };

        assert!(matches!(item, ResponseItem::V3 { .. }));
        assert_eq!(item.identifier(), CredentialType::Face);
        assert_eq!(item.nullifier(), "0xlegacy_nullifier");
        assert_eq!(item.merkle_root(), "0xlegacy_root");
        assert_eq!(item.proof(), "0xlegacy_proof");
    }

    #[test]
    fn test_response_item_serialization() {
        let v4 = ResponseItem::V4 {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            nullifier: "0xnullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        };

        let json = serde_json::to_string(&v4).unwrap();
        assert!(json.contains("proof_timestamp"));
        assert!(json.contains("issuer_schema_id"));
        assert!(json.contains("nullifier"));
        assert!(!json.contains("session_nullifier"));

        let deserialized: ResponseItem = serde_json::from_str(&json).unwrap();
        assert_eq!(v4, deserialized);

        let v3 = ResponseItem::V3 {
            identifier: CredentialType::Face,
            proof: "0xproof".to_string(),
            merkle_root: "0xroot".to_string(),
            nullifier_hash: "0xnullifier".to_string(),
        };

        let json = serde_json::to_string(&v3).unwrap();
        assert!(json.contains("nullifier_hash"));

        let deserialized: ResponseItem = serde_json::from_str(&json).unwrap();
        assert_eq!(v3, deserialized);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ResponseItem::Session tests (session proofs)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_response_item_session() {
        let item = ResponseItem::Session {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            session_nullifier: "0xsession_nullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        };

        assert!(matches!(item, ResponseItem::Session { .. }));
        assert_eq!(item.identifier(), CredentialType::Orb);
        assert_eq!(item.nullifier(), "0xsession_nullifier");
        assert_eq!(item.merkle_root(), "0xroot");
        assert_eq!(item.proof(), "0xproof");
        assert!(item.is_session());
    }

    #[test]
    fn test_response_item_session_serialization() {
        let item = ResponseItem::Session {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            session_nullifier: "0xsession_nullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("session_nullifier"));
        assert!(json.contains("proof_timestamp"));
        assert!(!json.contains("nullifier_hash")); // Not a v3 field

        let deserialized: ResponseItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, deserialized);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IDKitResult tests (uniqueness proof request results)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_idkit_result_v4() {
        let responses = vec![ResponseItem::V4 {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            nullifier: "0xnullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        }];

        let result = IDKitResult::new("4.0", responses);
        assert_eq!(result.protocol_version, "v4");
        assert_eq!(result.responses.len(), 1);
    }

    #[test]
    fn test_idkit_result_v3() {
        let responses = vec![ResponseItem::V3 {
            identifier: CredentialType::Face,
            proof: "0xproof".to_string(),
            merkle_root: "0xroot".to_string(),
            nullifier_hash: "0xnullifier".to_string(),
        }];

        let result = IDKitResult::new("v3", None, responses);
        assert_eq!(result.protocol_version, "v3");
        assert!(result.session_id.is_none());
        assert_eq!(result.responses.len(), 1);
    }

    #[test]
    fn test_idkit_result_serialization() {
        let responses = vec![ResponseItem::V4 {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            nullifier: "0xnullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        }];

        let result = IDKitResult::new("v4", Some("session-abc".to_string()), responses);
        let json = serde_json::to_string(&result).unwrap();

        assert!(json.contains(r#""protocol_version":"v4""#));
        assert!(json.contains(r#""session_id":"session-abc""#));
        assert!(json.contains("responses"));
        assert!(!json.contains("session_id")); // Action results don't have session_id

        let deserialized: IDKitResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result, deserialized);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IDKitResult session tests (session-based results using IDKitResult)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_idkit_result_session() {
        let responses = vec![ResponseItem::Session {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            session_nullifier: "0xsession_nullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        }];

        let result = IDKitResult::new_session("session-123".to_string(), responses);
        assert_eq!(result.session_id, Some("session-123".to_string()));
        assert_eq!(result.protocol_version, "4.0");
        assert_eq!(result.responses.len(), 1);
        assert!(result.is_session());
    }

    #[test]
    fn test_idkit_result_session_serialization() {
        let responses = vec![ResponseItem::Session {
            identifier: CredentialType::Orb,
            proof: "0xproof".to_string(),
            session_nullifier: "0xsession_nullifier".to_string(),
            merkle_root: "0xroot".to_string(),
            proof_timestamp: 1_700_000_000,
            issuer_schema_id: "0x1".to_string(),
        }];

        let result = IDKitResult::new_session("session-abc".to_string(), responses);
        let json = serde_json::to_string(&result).unwrap();

        assert!(json.contains(r#""session_id":"session-abc""#));
        assert!(json.contains("session_nullifier"));

        let deserialized: IDKitResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result, deserialized);
    }

    #[test]
    fn test_credential_type_from_issuer_schema_id() {
        assert_eq!(
            CredentialType::from_issuer_schema_id(1),
            Some(CredentialType::Orb)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(2),
            Some(CredentialType::Face)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(3),
            Some(CredentialType::SecureDocument)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(4),
            Some(CredentialType::Document)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(5),
            Some(CredentialType::Device)
        );
        assert_eq!(CredentialType::from_issuer_schema_id(0), None);
        assert_eq!(CredentialType::from_issuer_schema_id(99), None);
    }

    // BridgeUrl validation tests

    #[test]
    fn test_bridge_url_valid() {
        let app_id = AppId::new("app_123").unwrap();
        assert!(BridgeUrl::new("https://bridge.worldcoin.org", &app_id).is_ok());
    }

    #[test]
    fn test_bridge_url_invalid_protocol() {
        let app_id = AppId::new("app_123").unwrap();
        let err = BridgeUrl::new("http://bridge.worldcoin.org", &app_id).unwrap_err();
        assert!(err.to_string().contains("HTTPS"));
    }

    #[test]
    fn test_bridge_url_invalid_port() {
        let app_id = AppId::new("app_123").unwrap();
        assert!(BridgeUrl::new("https://bridge.worldcoin.org:8080", &app_id).is_err());
    }

    #[test]
    fn test_bridge_url_invalid_path() {
        let app_id = AppId::new("app_123").unwrap();
        assert!(BridgeUrl::new("https://bridge.worldcoin.org/api", &app_id).is_err());
    }

    #[test]
    fn test_bridge_url_invalid_query() {
        let app_id = AppId::new("app_123").unwrap();
        assert!(BridgeUrl::new("https://bridge.worldcoin.org?foo=bar", &app_id).is_err());
    }

    #[test]
    fn test_bridge_url_invalid_fragment() {
        let app_id = AppId::new("app_123").unwrap();
        assert!(BridgeUrl::new("https://bridge.worldcoin.org#section", &app_id).is_err());
    }

    #[test]
    fn test_bridge_url_staging_localhost() {
        let staging_app = AppId::new("app_staging_123").unwrap();
        assert!(BridgeUrl::new("http://localhost:3000", &staging_app).is_ok());
        assert!(BridgeUrl::new("http://127.0.0.1:8080", &staging_app).is_ok());
    }

    #[test]
    fn test_bridge_url_prod_rejects_localhost() {
        let prod_app = AppId::new("app_123").unwrap();
        assert!(BridgeUrl::new("http://localhost:3000", &prod_app).is_err());
    }
}
