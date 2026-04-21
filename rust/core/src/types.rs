//! Core types for the `IDKit` protocol

use serde::{Deserialize, Serialize};
use world_id_primitives::rp::RpId;

use std::{borrow::Cow, str::FromStr};

#[cfg(feature = "ffi")]
use std::sync::Arc;

/// Credential types that can be requested
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    strum::AsRefStr,
    strum::Display,
    strum::EnumString,
    strum::EnumIter,
)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum CredentialType {
    /// Proof of human credential
    ProofOfHuman,
    /// Face credential
    Face,
    /// Passport credential (ICAO 9303 compliant travel document)
    Passport,
    /// MNC (My Number Card) credential
    Mnc,
}

impl CredentialType {
    /// Returns the issuer schema ID for this credential type
    #[must_use]
    pub const fn issuer_schema_id(&self) -> u64 {
        match self {
            Self::ProofOfHuman => 1,
            Self::Face => 11,
            Self::Passport => 9303,
            Self::Mnc => 9310,
        }
    }

    /// Creates a `CredentialType` from an issuer schema ID
    ///
    /// Returns `None` if the ID doesn't map to a known credential type.
    #[must_use]
    pub const fn from_issuer_schema_id(id: u64) -> Option<Self> {
        match id {
            1 => Some(Self::ProofOfHuman),
            11 => Some(Self::Face),
            9303 => Some(Self::Passport),
            9310 => Some(Self::Mnc),
            _ => None,
        }
    }
}

/// A signal value that can be either a UTF-8 string or raw bytes
///
/// Signals are used to create unique proofs. They can be:
/// - UTF-8 strings (common case for off-chain usage)
/// - Raw bytes (user handles any encoding, e.g., ABI encoding for on-chain use)
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
pub enum Signal {
    /// UTF-8 string signal
    String(String),
    /// Raw bytes signal (user handles any encoding)
    Bytes(Vec<u8>),
}

impl Signal {
    /// Creates a signal from a JS-facing string using `IDKit` signal hashing semantics.
    ///
    /// This intentionally mirrors `@worldcoin/idkit-core`'s `hashSignal`:
    /// valid non-empty even-length `0x` hex strings are decoded as raw bytes,
    /// and all other strings are hashed as UTF-8 text. This keeps
    /// address-shaped signals aligned with Solidity `abi.encodePacked(address)`.
    /// Call `from_bytes` with UTF-8 bytes if a literal valid `0x...` string
    /// must be hashed as text.
    #[must_use]
    pub fn from_string(s: impl Into<String>) -> Self {
        let s = s.into();

        if let Some(bytes) = decode_prefixed_hex_signal(&s) {
            return Self::Bytes(bytes);
        }

        Self::String(s)
    }

    /// Creates a signal from raw bytes
    ///
    /// Use this when you have pre-encoded bytes (e.g., ABI-encoded for on-chain use).
    /// The caller is responsible for any encoding.
    #[must_use]
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Self {
        Self::Bytes(bytes.into())
    }

    /// Gets the raw bytes of the signal
    ///
    /// For strings, returns UTF-8 bytes. For ABI-encoded signals, returns the encoded bytes.
    /// Use `crypto::hash_signal` when hashing, since signal hashing applies
    /// `IDKit`'s `0x` string decoding semantics.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::String(s) => s.as_bytes(),
            Self::Bytes(b) => b,
        }
    }

    #[must_use]
    pub(crate) fn hash_input_bytes(&self) -> Cow<'_, [u8]> {
        match self {
            Self::String(s) => decode_prefixed_hex_signal(s)
                .map_or_else(|| Cow::Borrowed(s.as_bytes()), Cow::Owned),
            Self::Bytes(b) => Cow::Borrowed(b),
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

fn decode_prefixed_hex_signal(s: &str) -> Option<Vec<u8>> {
    let stripped = s.strip_prefix("0x")?;

    if stripped.is_empty() || stripped.len() % 2 != 0 {
        return None;
    }

    hex::decode(stripped).ok()
}

fn decode_serialized_hex_signal(s: &str) -> Option<Vec<u8>> {
    if s == "0x" {
        return Some(Vec::new());
    }

    decode_prefixed_hex_signal(s)
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

    /// Creates a signal from raw bytes
    #[must_use]
    #[uniffi::constructor(name = "from_bytes")]
    pub fn ffi_from_bytes(bytes: Vec<u8>) -> Arc<Self> {
        Arc::new(Self::from_bytes(bytes))
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
            Self::Bytes(b) => serializer.serialize_str(&format!("0x{}", hex::encode(b))),
        }
    }
}

impl<'de> Deserialize<'de> for Signal {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;

        // `Signal::Bytes([])` serializes as "0x", so serde accepts that empty
        // payload to keep byte signals stable across JSON boundaries. The
        // JS-facing `Signal::from_string` path still treats "0x" as text to
        // match `hashSignal("0x")`.
        if let Some(bytes) = decode_serialized_hex_signal(&s) {
            return Ok(Self::Bytes(bytes));
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

    /// Optional minimum expiration timestamp constraint for the proof
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at_min: Option<u64>,
}

impl CredentialRequest {
    /// Creates a new credential request with an optional signal
    #[must_use]
    pub fn new(credential_type: CredentialType, signal: Option<Signal>) -> Self {
        Self {
            credential_type,
            signal,
            genesis_issued_at_min: None,
            expires_at_min: None,
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
            expires_at_min: None,
        }
    }

    /// Creates a new request item with an expiration timestamp constraint
    #[must_use]
    pub fn with_expires_at_min(
        credential_type: CredentialType,
        signal: Option<Signal>,
        expires_at_min: u64,
    ) -> Self {
        Self {
            credential_type,
            signal,
            genesis_issued_at_min: None,
            expires_at_min: Some(expires_at_min),
        }
    }

    /// Gets the signal bytes used by protocol proof requests.
    ///
    /// These are the bytes the protocol hashes into the proof. Keep this aligned
    /// with `crypto::hash_signal`, including `IDKit`'s `0x` string decoding
    /// semantics for address-shaped signals.
    #[must_use]
    pub fn signal_bytes(&self) -> Option<Vec<u8>> {
        self.signal
            .as_ref()
            .map(|signal| signal.hash_input_bytes().into_owned())
    }

    /// Converts to a protocol `RequestItem`
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type cannot be mapped to an issuer schema ID
    pub fn to_protocol_item(&self) -> crate::Result<world_id_primitives::RequestItem> {
        let identifier = self.credential_type.to_string();
        let issuer_schema_id = self.credential_type.issuer_schema_id();

        // Protocol request items carry signal bytes and hash them downstream.
        // Keep this byte encoding in lockstep with `crypto::hash_signal`.
        let signal = self.signal_bytes();

        Ok(world_id_primitives::RequestItem::new(
            identifier,
            issuer_schema_id,
            signal,
            self.genesis_issued_at_min,
            self.expires_at_min,
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

    /// Creates a new credential request item with an expiration timestamp constraint
    #[must_use]
    #[uniffi::constructor(name = "with_expires_at_min")]
    pub fn ffi_with_expires_at_min(
        credential_type: CredentialType,
        signal: Option<Arc<Signal>>,
        expires_at_min: u64,
    ) -> Arc<Self> {
        let signal_opt = signal.map(|s| (*s).clone());
        Arc::new(Self::with_expires_at_min(
            credential_type,
            signal_opt,
            expires_at_min,
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

    /// Gets the expiration timestamp constraint
    #[must_use]
    pub fn expires_at_min(&self) -> Option<u64> {
        self.expires_at_min
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

/// A single identity attribute criterion for identity attestation.
///
/// Each variant carries the expected value for that attribute.
/// Numeric variants (e.g. `MinimumAge`) serialize their value as a JSON integer;
/// all other variants serialize as a JSON string.
///
/// Wire format: `{"type": "minimum_age", "value": 18}`
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
pub enum IdentityAttribute {
    /// The type of identity document presented
    DocumentType(DocumentType),
    /// Document number
    DocumentNumber(String),
    /// Issuing country (ISO 3166-1 alpha-3, e.g., "JPN")
    IssuingCountry(String),
    /// Full name as it appears on the document
    FullName(String),
    /// Minimum age in years
    MinimumAge(u8),
    /// Nationality (ISO 3166-1 alpha-3, e.g., "JPN")
    Nationality(String),
}

impl Serialize for IdentityAttribute {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(2))?;
        match self {
            Self::DocumentType(v) => {
                map.serialize_entry("type", "document_type")?;
                map.serialize_entry("value", v)?;
            }
            Self::DocumentNumber(v) => {
                map.serialize_entry("type", "document_number")?;
                map.serialize_entry("value", v)?;
            }
            Self::IssuingCountry(v) => {
                map.serialize_entry("type", "issuing_country")?;
                map.serialize_entry("value", v)?;
            }
            Self::FullName(v) => {
                map.serialize_entry("type", "full_name")?;
                map.serialize_entry("value", v)?;
            }
            Self::MinimumAge(v) => {
                map.serialize_entry("type", "minimum_age")?;
                map.serialize_entry("value", v)?;
            }
            Self::Nationality(v) => {
                map.serialize_entry("type", "nationality")?;
                map.serialize_entry("value", v)?;
            }
        }
        map.end()
    }
}

impl<'de> Deserialize<'de> for IdentityAttribute {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Helper {
            #[serde(rename = "type")]
            attribute_type: String,
            value: serde_json::Value,
        }

        let h = Helper::deserialize(deserializer)?;
        let str_val = |attr: &str| {
            h.value.as_str().map(String::from).ok_or_else(|| {
                serde::de::Error::custom(format!("expected string value for {attr}"))
            })
        };
        let u8_val = |attr: &str| {
            let n = h.value.as_u64().ok_or_else(|| {
                serde::de::Error::custom(format!("expected integer value for {attr}"))
            })?;
            u8::try_from(n).map_err(|_| {
                serde::de::Error::custom(format!("value {n} is out of range for {attr}"))
            })
        };

        match h.attribute_type.as_str() {
            "document_type" => {
                let doc_type = serde_json::from_value::<DocumentType>(h.value)
                    .map_err(serde::de::Error::custom)?;
                Ok(Self::DocumentType(doc_type))
            }
            "document_number" => Ok(Self::DocumentNumber(str_val("document_number")?)),
            "issuing_country" => Ok(Self::IssuingCountry(str_val("issuing_country")?)),
            "full_name" => Ok(Self::FullName(str_val("full_name")?)),
            "minimum_age" => Ok(Self::MinimumAge(u8_val("minimum_age")?)),
            "nationality" => Ok(Self::Nationality(str_val("nationality")?)),
            other => Err(serde::de::Error::custom(format!(
                "unknown identity attribute type: {other}"
            ))),
        }
    }
}

/// Identity document type used in [`IdentityAttribute::DocumentType`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
pub enum DocumentType {
    /// Biometric passport (ICAO 9303)
    Passport,
    /// National electronic identity card
    Eid,
    /// Japan's My Number Card
    Mnc,
}

/// Legacy bridge response (protocol v1 / World ID v3)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct BridgeResponseV1 {
    /// The Zero-knowledge proof of the verification (hex string, ABI encoded)
    pub proof: String,

    /// Hash pointer to the root of the Merkle tree (hex string, ABI encoded)
    pub merkle_root: String,

    /// User's unique identifier for the app and action (hex string, ABI encoded)
    pub nullifier_hash: String,

    /// The verification level used to generate the proof
    pub verification_level: VerificationLevel,
}

/// For context android still sends `credential_type` in the response
/// and iOS sends both `verification_level` and `credential_type` (with the same value).
///
/// To maintain compatibility with both platforms, we accept both fields as optional and require that at least one is present.
impl<'de> Deserialize<'de> for BridgeResponseV1 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        /// Helper struct that accepts both field names as separate optional fields.
        #[derive(Deserialize)]
        struct Helper {
            proof: String,
            merkle_root: String,
            nullifier_hash: String,
            verification_level: Option<VerificationLevel>,
            credential_type: Option<VerificationLevel>,
        }

        let helper = Helper::deserialize(deserializer)?;
        let verification_level = helper
            .verification_level
            .or(helper.credential_type)
            .ok_or_else(|| {
                serde::de::Error::missing_field("verification_level or credential_type")
            })?;

        Ok(Self {
            proof: helper.proof,
            merkle_root: helper.merkle_root,
            nullifier_hash: helper.nullifier_hash,
            verification_level,
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Response Types (World ID 4.0)
// ─────────────────────────────────────────────────────────────────────────────

/// A single credential response item for uniqueness proofs
///
/// V4 is detected by presence of `issuer_schema_id`.
/// V3 is detected by presence of `nullifier` (without `issuer_schema_id`).
/// Session is detected by presence of `session_nullifier`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(untagged)]
pub enum ResponseItem {
    /// Protocol version 4.0 (World ID v4)
    V4 {
        /// Credential identifier (e.g., `proof_of_human`, `face`, `passport`, `mnc`)
        identifier: String,
        /// Signal hash (optional, included if signal was provided in request)
        #[serde(skip_serializing_if = "Option::is_none")]
        signal_hash: Option<String>,
        /// Credential issuer schema ID
        issuer_schema_id: u64,
        /// Encoded World ID Proof
        ///
        /// The first 4 elements are the compressed Groth16 proof,
        /// and the 5th element is the Merkle root (all hex strings)
        ///
        /// This can be used directly with the `WorldIDVerifier.sol` contract to verify the proof.
        proof: Vec<String>,
        /// RP-scoped nullifier (hex string)
        nullifier: String,
        /// Minimum expiration timestamp for the proof
        expires_at_min: u64,
    },
    /// Session proof (World ID v4 sessions)
    Session {
        /// Credential identifier (e.g., `proof_of_human`, `face`, `passport`, `mnc`)
        identifier: String,
        /// Signal hash (optional, included if signal was provided in request)
        #[serde(skip_serializing_if = "Option::is_none")]
        signal_hash: Option<String>,
        /// Credential issuer schema ID
        issuer_schema_id: u64,
        /// Encoded World ID Proof
        ///
        /// The first 4 elements are the compressed Groth16 proof,
        /// and the 5th element is the Merkle root (all hex strings)
        ///
        /// This can be used directly with the `WorldIDVerifier.sol` contract to verify the proof.
        proof: Vec<String>,
        /// Session nullifier
        ///
        /// - 1st element is the nullifier for the session
        /// - 2nd element is the generated action
        session_nullifier: Vec<String>,
        /// Minimum expiration timestamp for the proof
        expires_at_min: u64,
    },
    /// Protocol version 3.0 (World ID v3 - legacy format)
    V3 {
        /// Credential identifier (e.g., `proof_of_human`, `face`)
        identifier: String,
        /// Signal hash (hash of the signal provided in the request, or hash of empty signal)
        signal_hash: String,
        /// ABI-encoded proof (hex string)
        proof: String,
        /// Merkle root (hex string)
        merkle_root: String,
        /// Nullifier (hex string)
        nullifier: String,
    },
}

/// This is the top-level result returned from a proof request flow.
/// It contains the protocol version and an array of credential responses.
/// For session proofs, it also contains the `session_id`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct IDKitResult {
    /// Protocol version ("4.0" or "3.0") - applies to all responses
    pub protocol_version: String,

    /// Nonce used in the request (always present)
    pub nonce: String,

    /// Action identifier (only for uniqueness proofs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,

    /// Action description (only if provided in input)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_description: Option<String>,

    /// Opaque session identifier in protocol string form (`session_<hex>`)
    /// (only present for session proofs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    /// Array of credential responses (always successful - errors at `BridgeResponse` level)
    pub responses: Vec<ResponseItem>,

    /// The environment used for this request ("production" or "staging")
    pub environment: String,

    /// Whether identity attributes were attested.
    /// Only present on responses from an `IdentityCheck` request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_attested: Option<bool>,
}

impl IDKitResult {
    /// Creates a new `IDKitResult` with protocol version and responses (no session)
    #[must_use]
    pub fn new(
        protocol_version: impl Into<String>,
        nonce: impl Into<String>,
        action: Option<String>,
        action_description: Option<String>,
        responses: Vec<ResponseItem>,
        environment: impl Into<String>,
    ) -> Self {
        Self {
            protocol_version: protocol_version.into(),
            nonce: nonce.into(),
            action,
            action_description,
            session_id: None,
            responses,
            environment: environment.into(),
            identity_attested: None,
        }
    }

    /// Creates a new `IDKitResult` for a session proof with a protocol session ID
    /// (`session_<hex>`) and responses
    #[must_use]
    pub fn new_session(
        nonce: impl Into<String>,
        session_id: String,
        action_description: Option<String>,
        responses: Vec<ResponseItem>,
        environment: impl Into<String>,
    ) -> Self {
        Self {
            protocol_version: "4.0".to_string(),
            nonce: nonce.into(),
            action: None,
            action_description,
            session_id: Some(session_id),
            responses,
            environment: environment.into(),
            identity_attested: None,
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
            .map_or(0, |d| d.as_secs());

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
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, strum::AsRefStr, strum::Display,
)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
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

// UniFFI helper function for CredentialType
#[cfg(feature = "ffi")]
/// Gets the string representation of a credential type
#[must_use]
#[uniffi::export]
pub fn credential_to_string(credential: &CredentialType) -> String {
    credential.to_string()
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
        let item = CredentialRequest::new(
            CredentialType::ProofOfHuman,
            Some(Signal::from_string("signal")),
        );
        assert_eq!(item.credential_type, CredentialType::ProofOfHuman);
        assert_eq!(item.signal, Some(Signal::from_string("signal")));
        assert_eq!(item.genesis_issued_at_min, None);

        // Test without signal
        let no_signal = CredentialRequest::new(CredentialType::Face, None);
        assert_eq!(no_signal.signal, None);
    }

    #[test]
    fn test_request_item_with_genesis_min() {
        let item = CredentialRequest::with_genesis_min(
            CredentialType::ProofOfHuman,
            Some(Signal::from_string("signal")),
            1_700_000_000,
        );
        assert_eq!(item.credential_type, CredentialType::ProofOfHuman);
        assert_eq!(item.genesis_issued_at_min, Some(1_700_000_000));
    }

    #[test]
    fn test_request_item_with_bytes_signal() {
        // Test creating request item with raw bytes
        let bytes = b"arbitrary\x00\xFF\xFE data";
        let item = CredentialRequest::new(
            CredentialType::ProofOfHuman,
            Some(Signal::from_bytes(bytes)),
        );

        // Verify signal is stored as bytes
        assert!(item.signal.is_some());
        let signal = item.signal.as_ref().unwrap();
        assert_eq!(signal, &Signal::from_bytes(bytes));

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
    fn test_request_item_with_direct_hex_string_signal_uses_hash_input_bytes() {
        let signal = "0x3df41d9d0ba00d8fbe5a9896bb01efc4b3787b7c";
        let expected = hex::decode(signal.strip_prefix("0x").unwrap()).unwrap();
        let item = CredentialRequest::new(
            CredentialType::Face,
            Some(Signal::String(signal.to_string())),
        );

        assert_eq!(item.signal_bytes(), Some(expected.clone()));
        assert_eq!(item.to_protocol_item().unwrap().signal, Some(expected));
    }

    #[test]
    fn test_request_item_without_signal() {
        let item = CredentialRequest::new(CredentialType::Passport, None);
        assert_eq!(item.signal, None);
        assert_eq!(item.signal_bytes(), None);
    }

    #[test]
    fn test_signal_serialization() {
        // Test string signal serialization
        let signal = Signal::from_string("test_signal");
        let json = serde_json::to_string(&signal).unwrap();
        assert_eq!(json, r#""test_signal""#);

        // Test bytes signal serialization (hex-encoded with 0x prefix)
        let bytes_signal = Signal::from_bytes(vec![0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello" bytes
        let json = serde_json::to_string(&bytes_signal).unwrap();
        assert_eq!(json, r#""0x48656c6c6f""#);

        // Empty bytes serialize as "0x" and must round-trip as bytes, not text.
        let empty_bytes_signal = Signal::from_bytes(Vec::<u8>::new());
        let json = serde_json::to_string(&empty_bytes_signal).unwrap();
        assert_eq!(json, r#""0x""#);
        let deserialized: Signal = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, empty_bytes_signal);
        assert_eq!(
            crate::crypto::hash_signal(&deserialized),
            crate::crypto::hash_signal(&Signal::from_bytes(Vec::<u8>::new()))
        );
    }

    #[test]
    fn test_signal_deserialization() {
        // Test 0x-prefixed hex deserialization (treated as bytes)
        let signal: Signal = serde_json::from_str(r#""0x48656c6c6f""#).unwrap();
        assert_eq!(signal.as_bytes(), b"Hello");
        assert!(matches!(signal, Signal::Bytes(_)));

        // Test empty 0x-prefixed hex deserialization preserves serialized bytes
        let signal: Signal = serde_json::from_str(r#""0x""#).unwrap();
        assert_eq!(signal, Signal::Bytes(Vec::new()));

        // Test non-prefixed hex is treated as a plain string (not bytes)
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
    fn test_signal_from_string_decodes_valid_prefixed_hex() {
        let signal = Signal::from_string("0x48656c6c6f");
        assert_eq!(signal.as_bytes(), b"Hello");
        assert!(matches!(signal, Signal::Bytes(_)));

        let address = Signal::from_string("0x3df41d9d0ba00d8fbe5a9896bb01efc4b3787b7c");
        assert_eq!(address.as_bytes().len(), 20);
        assert!(matches!(address, Signal::Bytes(_)));
    }

    #[test]
    fn test_signal_from_string_keeps_invalid_hex_as_string() {
        for value in ["0x", "0x0", "0xabc", "0xzz"] {
            let signal = Signal::from_string(value);
            assert_eq!(signal.as_str(), Some(value));
            assert!(matches!(signal, Signal::String(_)));
        }
    }

    #[test]
    fn test_credential_serialization() {
        let cred = CredentialType::ProofOfHuman;
        let json = serde_json::to_string(&cred).unwrap();
        assert_eq!(json, r#""proof_of_human""#);

        let deserialized: CredentialType = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, CredentialType::ProofOfHuman);
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
    // IDKitResult tests (uniqueness proof request results)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_idkit_result_v3() {
        let responses = vec![ResponseItem::V3 {
            identifier: "face".to_string(),
            signal_hash: String::new(),
            proof: "0xproof".to_string(),
            merkle_root: "0xroot".to_string(),
            nullifier: "0xnullifier".to_string(),
        }];

        let result = IDKitResult::new(
            "3.0",
            "0x0000000000000000000000000000000000000000000000000000000000000001",
            None,
            None,
            responses,
            "production",
        );
        assert_eq!(result.protocol_version, "3.0");
        assert_eq!(
            result.nonce,
            "0x0000000000000000000000000000000000000000000000000000000000000001"
        );
        assert_eq!(result.responses.len(), 1);
    }

    #[test]
    fn test_credential_type_issuer_schema_id() {
        assert_eq!(CredentialType::ProofOfHuman.issuer_schema_id(), 1);
        assert_eq!(CredentialType::Face.issuer_schema_id(), 11);
        assert_eq!(CredentialType::Passport.issuer_schema_id(), 9303);
        assert_eq!(CredentialType::Mnc.issuer_schema_id(), 9310);
    }

    #[test]
    fn test_credential_type_from_issuer_schema_id() {
        assert_eq!(
            CredentialType::from_issuer_schema_id(1),
            Some(CredentialType::ProofOfHuman)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(11),
            Some(CredentialType::Face)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(9303),
            Some(CredentialType::Passport)
        );
        assert_eq!(
            CredentialType::from_issuer_schema_id(9310),
            Some(CredentialType::Mnc)
        );
        assert_eq!(CredentialType::from_issuer_schema_id(0), None);
        assert_eq!(CredentialType::from_issuer_schema_id(99), None);
    }

    #[test]
    fn test_credential_type_issuer_schema_roundtrip() {
        use strum::IntoEnumIterator;
        for cred in CredentialType::iter() {
            let id = cred.issuer_schema_id();
            assert_eq!(CredentialType::from_issuer_schema_id(id), Some(cred));
        }
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

    // ─────────────────────────────────────────────────────────────────────────
    // IdentityAttribute serialization / deserialization
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_identity_attribute_string_variants_serialize() {
        let cases: &[(IdentityAttribute, &str)] = &[
            (
                IdentityAttribute::DocumentType(DocumentType::Passport),
                r#"{"type":"document_type","value":"passport"}"#,
            ),
            (
                IdentityAttribute::DocumentType(DocumentType::Eid),
                r#"{"type":"document_type","value":"eid"}"#,
            ),
            (
                IdentityAttribute::DocumentType(DocumentType::Mnc),
                r#"{"type":"document_type","value":"mnc"}"#,
            ),
            (
                IdentityAttribute::DocumentNumber("X12345678".into()),
                r#"{"type":"document_number","value":"X12345678"}"#,
            ),
            (
                IdentityAttribute::IssuingCountry("JPN".into()),
                r#"{"type":"issuing_country","value":"JPN"}"#,
            ),
            (
                IdentityAttribute::FullName("John Smith".into()),
                r#"{"type":"full_name","value":"John Smith"}"#,
            ),
            (
                IdentityAttribute::Nationality("JPN".into()),
                r#"{"type":"nationality","value":"JPN"}"#,
            ),
        ];
        for (attr, expected) in cases {
            assert_eq!(serde_json::to_string(attr).unwrap(), *expected);
        }
    }

    #[test]
    fn test_identity_attribute_roundtrip() {
        let attrs = vec![
            IdentityAttribute::DocumentType(DocumentType::Passport),
            IdentityAttribute::DocumentType(DocumentType::Eid),
            IdentityAttribute::DocumentType(DocumentType::Mnc),
            IdentityAttribute::DocumentNumber("X12345678".into()),
            IdentityAttribute::IssuingCountry("JPN".into()),
            IdentityAttribute::FullName("John Smith".into()),
            IdentityAttribute::MinimumAge(18),
            IdentityAttribute::Nationality("JPN".into()),
        ];
        for attr in &attrs {
            let json = serde_json::to_string(attr).unwrap();
            let back: IdentityAttribute = serde_json::from_str(&json).unwrap();
            assert_eq!(attr, &back);
        }
    }

    #[test]
    fn test_identity_attribute_full_array_matches_spec() {
        let json = r#"[
            {"type":"document_type","value":"passport"},
            {"type":"document_number","value":"X12345678"},
            {"type":"issuing_country","value":"JPN"},
            {"type":"full_name","value":"John Smith"},
            {"type":"minimum_age","value":18},
            {"type":"nationality","value":"JPN"}
        ]"#;
        let attrs: Vec<IdentityAttribute> = serde_json::from_str(json).unwrap();
        assert_eq!(
            attrs[0],
            IdentityAttribute::DocumentType(DocumentType::Passport)
        );
        assert_eq!(attrs[4], IdentityAttribute::MinimumAge(18));
    }
}
