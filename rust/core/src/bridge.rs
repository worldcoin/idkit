//! `BridgeConnection` management for World ID verification with the [Wallet Bridge](https://github.com/worldcoin/wallet-bridge).

#[cfg(feature = "ffi")]
use crate::preset::Preset;
use crate::{
    crypto::{base64_decode, base64_encode, decrypt, encrypt},
    error::{AppError, Error, Result},
    protocol_types::ProofRequest,
    types::{
        AppId, BridgeResponseV1, BridgeUrl, CredentialType, IDKitResult, ResponseItem, RpContext,
        VerificationLevel,
    },
    ConstraintNode, Signal,
};
use alloy_primitives::Signature;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use world_id_primitives::FieldElement;

#[cfg(feature = "native-crypto")]
use crate::crypto::CryptoKey;

use std::str::FromStr;
#[cfg(feature = "ffi")]
use std::sync::Arc;

// ─────────────────────────────────────────────────────────────────────────────
// Request Kind (internal)
// ─────────────────────────────────────────────────────────────────────────────

/// Enum representing the type of proof request
pub enum RequestKind {
    /// Uniqueness proof
    Uniqueness { action: String },
    /// Create a new session (returns `session_id` in response)
    CreateSession,
    /// Prove ownership of an existing session
    ProveSession { session_id: String },
}

/// Bridge request payload sent to initialize a session
#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct BridgeRequestPayload {
    // ---------------------------------------------------
    // -- Legacy fields for World ID 3.0 compatibility --
    // ---------------------------------------------------
    /// Application ID from the Developer Portal
    app_id: String,

    /// Action ID from the Developer Portal (optional for session-only flows)
    #[serde(skip_serializing_if = "Option::is_none")]
    action: Option<String>,

    /// Optional action description
    #[serde(skip_serializing_if = "Option::is_none")]
    action_description: Option<String>,

    /// Hashed signal for legacy compatibility (World App 3.0)
    /// Derived from the request with the max verification level credential type
    signal: String,

    /// Min verification level derived from requests (World App 3.0 compatibility)
    verification_level: VerificationLevel,

    // -----------------------------------------------
    // -- New Proof Request fields for World ID 4.0 --
    // -----------------------------------------------
    /// The protocol-level proof request
    proof_request: ProofRequest,

    /// Whether to accept legacy (v3) proofs as fallback.
    /// - `true`: Accept both v3 and v4 proofs. Use during migration.
    /// - `false`: Only accept v4 proofs. Use after migration cutoff or for new apps.
    allow_legacy_proofs: bool,
}

/// Encrypted payload sent to/from the bridge
#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptedPayload {
    /// Base64-encoded initialization vector
    pub iv: String,

    /// Base64-encoded encrypted payload
    pub payload: String,
}

/// Response from bridge when creating a request
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct BridgeCreateResponse {
    /// Unique request ID
    request_id: Uuid,
}

/// Response from bridge when polling for status
#[derive(Debug, Deserialize)]
struct BridgePollResponse {
    /// Current status
    status: String,

    /// Encrypted response (only present when status is "completed")
    response: Option<EncryptedPayload>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Bridge Response Types (for deserialization)
// ─────────────────────────────────────────────────────────────────────────────

/// Internal: Bridge response item - tagged by `protocol_version`
///
/// Used for uniqueness proofs. Session proofs use `BridgeSessionResponseItem`.
#[derive(Debug, Deserialize)]
#[serde(tag = "protocol_version")]
enum BridgeResponseItem {
    #[serde(rename = "4.0")]
    V4 {
        identifier: String,
        issuer_schema_id: String,
        proof: String,
        nullifier: String,
        merkle_root: String,
        expires_at_min: u64,
    },
    #[serde(rename = "3.0")]
    V3 {
        proof: String,
        merkle_root: String,
        nullifier_hash: String,
        verification_level: CredentialType,
    },
}

impl BridgeResponseItem {
    /// Converts to a `ResponseItem` for uniqueness proofs
    fn into_response_item(self) -> ResponseItem {
        match self {
            Self::V4 {
                identifier,
                issuer_schema_id,
                proof,
                nullifier,
                merkle_root,
                expires_at_min,
            } => ResponseItem::V4 {
                identifier,
                proof,
                nullifier,
                merkle_root,
                issuer_schema_id,
                expires_at_min,
            },
            Self::V3 {
                proof,
                merkle_root,
                nullifier_hash,
                verification_level,
            } => ResponseItem::V3 {
                identifier: verification_level.as_str().to_string(),
                proof,
                merkle_root,
                nullifier_hash,
            },
        }
    }
}

impl BridgeResponseV1 {
    fn into_response_item(self) -> ResponseItem {
        ResponseItem::V3 {
            identifier: self.verification_level.as_str().to_string(),
            proof: self.proof,
            merkle_root: self.merkle_root,
            nullifier_hash: self.nullifier_hash,
        }
    }
}

/// V2 bridge response with multi-credential support (action proofs only)
#[derive(Debug, Deserialize)]
struct BridgeResponseV2 {
    #[allow(dead_code)]
    id: Option<String>,
    responses: Vec<BridgeResponseItem>,
}

/// Parse `issuer_schema_id` string as hex u64
#[cfg(test)]
fn parse_issuer_schema_id(issuer_schema_id: &str) -> Option<u64> {
    let clean_id = issuer_schema_id
        .strip_prefix("0x")
        .unwrap_or(issuer_schema_id);
    u64::from_str_radix(clean_id, 16).ok()
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge Response Types
// ─────────────────────────────────────────────────────────────────────────────

/// Decrypted response from the World App
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum BridgeResponse {
    /// Error response
    Error { error_code: AppError },

    /// Session response (World ID 4.0 session proofs)
    /// Must come before `ResponseV2` since both have similar structure,
    /// but `SessionResponse` requires `session_id` and `session_nullifier`
    SessionResponse(BridgeSessionResponse),

    /// V2 response with multi-credential support (World ID 4.0 uniqueness proofs)
    ResponseV2(BridgeResponseV2),

    /// V1 legacy success response with proof (World ID 3.0)
    ResponseV1(BridgeResponseV1),
}

/// Status of a verification request
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    /// Waiting for World App to retrieve the request
    WaitingForConnection,

    /// World App has retrieved the request, waiting for user confirmation
    AwaitingConfirmation,

    /// User has confirmed and provided proof(s)
    /// For session proofs, `IDKitResult.session_id` will be `Some(id)`
    Confirmed(IDKitResult),

    /// Request has failed
    Failed(AppError),
}

/// Session response from bridge (World ID 4.0 session proofs)
#[derive(Debug, Deserialize)]
struct BridgeSessionResponse {
    #[allow(dead_code)]
    id: Option<String>,
    /// Session ID (required for session responses)
    session_id: String,
    /// Session response items with `session_nullifier`
    responses: Vec<BridgeSessionResponseItem>,
}

/// Session-specific response item from bridge
#[derive(Debug, Deserialize)]
struct BridgeSessionResponseItem {
    identifier: String,
    issuer_schema_id: String,
    proof: String,
    session_nullifier: String,
    merkle_root: String,
    expires_at_min: u64,
}

impl BridgeSessionResponseItem {
    fn into_response_item(self) -> ResponseItem {
        ResponseItem::Session {
            identifier: self.identifier,
            proof: self.proof,
            session_nullifier: self.session_nullifier,
            merkle_root: self.merkle_root,
            issuer_schema_id: self.issuer_schema_id,
            expires_at_min: self.expires_at_min,
        }
    }
}

/// Parameters for creating a `BridgeConnection`
pub struct BridgeConnectionParams {
    pub app_id: AppId,
    pub kind: RequestKind,
    pub constraints: ConstraintNode,
    pub rp_context: RpContext,
    pub action_description: Option<String>,
    pub legacy_verification_level: VerificationLevel,
    pub legacy_signal: String,
    pub bridge_url: Option<BridgeUrl>,
    pub allow_legacy_proofs: bool,
}

/// A World ID verification connection to the bridge
///
/// Manages the verification flow with World App via the bridge.
pub struct BridgeConnection {
    bridge_url: BridgeUrl,
    #[cfg(feature = "native-crypto")]
    key: CryptoKey,
    key_bytes: Vec<u8>,
    request_id: Uuid,
    client: reqwest::Client,
}

impl BridgeConnection {
    /// Creates a new bridge connection
    ///
    /// # Arguments
    ///
    /// * `params` - Parameters for creating the connection
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created or the bridge call fails
    #[allow(dead_code)]
    pub(crate) async fn create(params: BridgeConnectionParams) -> Result<Self> {
        // Validate constraints
        params.constraints.validate()?;

        let bridge_url = params.bridge_url.unwrap_or_default();

        // Generate encryption key and IV
        #[cfg(feature = "native-crypto")]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        #[cfg(feature = "native-crypto")]
        let key = CryptoKey::new(key_bytes, nonce_bytes);

        #[cfg(not(feature = "native-crypto"))]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        // Extract action and session_id from kind
        let (action_fe, session_id_fe, action_str) = match &params.kind {
            RequestKind::Uniqueness { action } => {
                let fe = FieldElement::from_arbitrary_raw_bytes(action.as_bytes());
                (Some(fe), None, Some(action.clone()))
            }
            RequestKind::CreateSession => (None, None, None),
            RequestKind::ProveSession { session_id } => {
                let fe = FieldElement::from_str(session_id).map_err(|_| {
                    Error::InvalidConfiguration("Invalid session_id format".to_string())
                })?;
                (None, Some(fe), None)
            }
        };

        // Build ProofRequest protocol type
        let (request_items, constraint_expr) = params.constraints.to_protocol_top_level()?;
        let signature = Signature::from_str(&params.rp_context.signature)
            .map_err(|_| Error::InvalidConfiguration("Invalid signature".to_string()))?;
        let nonce = FieldElement::from_str(&params.rp_context.nonce)
            .map_err(|_| Error::InvalidConfiguration("Invalid nonce format".to_string()))?;

        let proof_request = ProofRequest::new(
            params.rp_context.created_at,
            params.rp_context.expires_at,
            params.rp_context.rp_id,
            action_fe,
            session_id_fe,
            signature,
            nonce,
            request_items,
            constraint_expr,
            params.allow_legacy_proofs,
        );

        // For backwards compatibility we encode the hash of the signal
        let legacy_signal_hash =
            crate::crypto::encode_signal(&Signal::from_string(params.legacy_signal));

        // Prepare the payload
        let payload = BridgeRequestPayload {
            app_id: params.app_id.as_str().to_string(),
            action: action_str,
            action_description: params.action_description,
            proof_request,
            verification_level: params.legacy_verification_level,
            signal: legacy_signal_hash,
            allow_legacy_proofs: params.allow_legacy_proofs,
        };

        let payload_json = serde_json::to_vec(&payload)?;

        // Encrypt the payload
        #[cfg(feature = "native-crypto")]
        let encrypted = encrypt(&key_bytes, &nonce_bytes, &payload_json)?;

        #[cfg(not(feature = "native-crypto"))]
        let encrypted = encrypt(&key_bytes, &nonce_bytes, &payload_json)?;

        let encrypted_payload = EncryptedPayload {
            iv: base64_encode(&nonce_bytes),
            payload: base64_encode(&encrypted),
        };

        // Send to bridge
        let client = reqwest::Client::builder()
            .user_agent(format!("idkit-core/{}", env!("CARGO_PKG_VERSION")))
            .build()?;

        let response = client
            .post(bridge_url.join("/request")?)
            .json(&encrypted_payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::BridgeError(format!(
                "Bridge request failed with status {}: {}",
                status,
                if body.is_empty() {
                    "no error details"
                } else {
                    &body
                }
            )));
        }

        let create_response: BridgeCreateResponse = response.json().await?;

        Ok(Self {
            bridge_url,
            #[cfg(feature = "native-crypto")]
            key,
            key_bytes: key_bytes.to_vec(),
            request_id: create_response.request_id,
            client,
        })
    }

    /// Returns the connect URL for World App
    #[must_use]
    pub fn connect_url(&self) -> String {
        let key_b64 = base64_encode(&self.key_bytes);
        let bridge_param = if self.bridge_url == BridgeUrl::default() {
            String::new()
        } else {
            format!("&b={}", urlencoding::encode(self.bridge_url.as_str()))
        };

        format!(
            "https://world.org/verify?t=wld&i={}&k={}{}",
            self.request_id,
            urlencoding::encode(&key_b64),
            bridge_param
        )
    }

    /// Polls the bridge for the current status (non-blocking)
    ///
    /// # Errors
    ///
    /// Returns an error if the request fails or the response is invalid
    pub async fn poll_for_status(&self) -> Result<Status> {
        let response = self
            .client
            .get(
                self.bridge_url
                    .join(&format!("/response/{}", self.request_id))?,
            )
            .send()
            .await?;

        if !response.status().is_success() {
            return Ok(Status::Failed(AppError::ConnectionFailed));
        }

        let poll_response: BridgePollResponse = response.json().await?;

        match poll_response.status.as_str() {
            "initialized" => Ok(Status::WaitingForConnection),
            "retrieved" => Ok(Status::AwaitingConfirmation),
            "completed" => {
                let encrypted = poll_response.response.ok_or(Error::UnexpectedResponse)?;

                let iv = base64_decode(&encrypted.iv)?;
                let ciphertext = base64_decode(&encrypted.payload)?;

                // Both paths use the IV from the encrypted response (not stored nonce)
                // because the authenticator encrypts with its own nonce
                #[cfg(feature = "native-crypto")]
                let plaintext = decrypt(&self.key.key, &iv, &ciphertext)?;

                #[cfg(not(feature = "native-crypto"))]
                let plaintext = decrypt(&self.key_bytes, &iv, &ciphertext)?;

                let bridge_response: BridgeResponse = serde_json::from_slice(&plaintext)?;

                match bridge_response {
                    BridgeResponse::Error { error_code } => Ok(Status::Failed(error_code)),
                    BridgeResponse::SessionResponse(response) => {
                        // Session responses are always protocol 4.0
                        let responses = response
                            .responses
                            .into_iter()
                            .map(BridgeSessionResponseItem::into_response_item)
                            .collect();
                        Ok(Status::Confirmed(IDKitResult::new_session(
                            response.session_id,
                            responses,
                        )))
                    }
                    BridgeResponse::ResponseV2(response) => {
                        // Determine protocol version from first response item
                        let protocol_version =
                            response.responses.first().map_or("4.0", |item| match item {
                                BridgeResponseItem::V4 { .. } => "4.0",
                                BridgeResponseItem::V3 { .. } => "3.0",
                            });

                        let responses = response
                            .responses
                            .into_iter()
                            .map(BridgeResponseItem::into_response_item)
                            .collect();
                        Ok(Status::Confirmed(IDKitResult::new(
                            protocol_version,
                            responses,
                        )))
                    }
                    BridgeResponse::ResponseV1(response) => {
                        // V1 responses are always protocol 3.0
                        let item = response.into_response_item();
                        Ok(Status::Confirmed(IDKitResult::new("3.0", vec![item])))
                    }
                }
            }
            _ => Err(Error::UnexpectedResponse),
        }
    }

    /// Returns the request ID for this request
    #[must_use]
    pub const fn request_id(&self) -> Uuid {
        self.request_id
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UniFFI bindings
// ─────────────────────────────────────────────────────────────────────────────

/// Configuration for `request()`
#[cfg(feature = "ffi")]
#[derive(Clone, uniffi::Record)]
pub struct IDKitRequestConfig {
    /// Application ID from the Developer Portal
    pub app_id: String,
    /// Action identifier
    pub action: String,
    /// RP context for building protocol-level `ProofRequest`
    pub rp_context: Arc<RpContext>,
    /// Optional action description shown to users
    pub action_description: Option<String>,
    /// Optional bridge URL (defaults to production)
    pub bridge_url: Option<String>,
    /// Whether to accept legacy (v3) proofs as fallback.
    /// - `true`: Accept both v3 and v4 proofs. Use during migration.
    /// - `false`: Only accept v4 proofs. Use after migration cutoff or for new apps.
    pub allow_legacy_proofs: bool,
}

/// Configuration for session requests (no action field, v4 only)
///
/// Sessions are always World ID v4 - there is no legacy (v3) session support.
#[cfg(feature = "ffi")]
#[derive(Clone, uniffi::Record)]
pub struct IDKitSessionConfig {
    /// Application ID from the Developer Portal
    pub app_id: String,
    /// RP context for building protocol-level `ProofRequest`
    pub rp_context: Arc<RpContext>,
    /// Optional action description shown to users
    pub action_description: Option<String>,
    /// Optional bridge URL (defaults to production)
    pub bridge_url: Option<String>,
}

/// Internal enum to store builder configuration
#[cfg(feature = "ffi")]
#[derive(Clone)]
enum IDKitConfig {
    Request(IDKitRequestConfig),
    CreateSession(IDKitSessionConfig),
    ProveSession {
        session_id: String,
        config: IDKitSessionConfig,
    },
}

#[cfg(feature = "ffi")]
impl IDKitConfig {
    /// Converts config + constraints to `BridgeConnectionParams`
    fn to_params(
        &self,
        constraints: ConstraintNode,
    ) -> std::result::Result<BridgeConnectionParams, crate::error::IdkitError> {
        match self {
            Self::Request(config) => {
                let app_id = AppId::new(&config.app_id)?;
                let bridge_url = config
                    .bridge_url
                    .as_ref()
                    .map(|url| BridgeUrl::new(url, &app_id))
                    .transpose()?;

                Ok(BridgeConnectionParams {
                    app_id,
                    kind: RequestKind::Uniqueness {
                        action: config.action.clone(),
                    },
                    constraints,
                    rp_context: (*config.rp_context).clone(),
                    action_description: config.action_description.clone(),
                    legacy_verification_level: VerificationLevel::Deprecated,
                    legacy_signal: String::new(),
                    bridge_url,
                    allow_legacy_proofs: config.allow_legacy_proofs,
                })
            }
            Self::CreateSession(config) => {
                let app_id = AppId::new(&config.app_id)?;
                let bridge_url = config
                    .bridge_url
                    .as_ref()
                    .map(|url| BridgeUrl::new(url, &app_id))
                    .transpose()?;

                Ok(BridgeConnectionParams {
                    app_id,
                    kind: RequestKind::CreateSession,
                    constraints,
                    rp_context: (*config.rp_context).clone(),
                    action_description: config.action_description.clone(),
                    legacy_verification_level: VerificationLevel::Deprecated,
                    legacy_signal: String::new(),
                    bridge_url,
                    allow_legacy_proofs: false,
                })
            }
            Self::ProveSession { session_id, config } => {
                let app_id = AppId::new(&config.app_id)?;
                let bridge_url = config
                    .bridge_url
                    .as_ref()
                    .map(|url| BridgeUrl::new(url, &app_id))
                    .transpose()?;

                Ok(BridgeConnectionParams {
                    app_id,
                    kind: RequestKind::ProveSession {
                        session_id: session_id.clone(),
                    },
                    constraints,
                    rp_context: (*config.rp_context).clone(),
                    action_description: config.action_description.clone(),
                    legacy_verification_level: VerificationLevel::Deprecated,
                    legacy_signal: String::new(),
                    bridge_url,
                    allow_legacy_proofs: false,
                })
            }
        }
    }

    /// Converts config + preset to `BridgeConnectionParams` (works for all types)
    #[allow(clippy::needless_pass_by_value)]
    fn to_params_from_preset(
        &self,
        preset: Preset,
    ) -> std::result::Result<BridgeConnectionParams, crate::error::IdkitError> {
        let (constraints, legacy_verification_level, legacy_signal) = preset.to_bridge_params();

        match self {
            Self::Request(config) => {
                let app_id = AppId::new(&config.app_id)?;
                let bridge_url = config
                    .bridge_url
                    .as_ref()
                    .map(|url| BridgeUrl::new(url, &app_id))
                    .transpose()?;

                Ok(BridgeConnectionParams {
                    app_id,
                    kind: RequestKind::Uniqueness {
                        action: config.action.clone(),
                    },
                    constraints,
                    rp_context: (*config.rp_context).clone(),
                    action_description: config.action_description.clone(),
                    legacy_verification_level,
                    legacy_signal: legacy_signal.unwrap_or_default(),
                    bridge_url,
                    allow_legacy_proofs: config.allow_legacy_proofs,
                })
            }
            Self::CreateSession(config) => {
                let app_id = AppId::new(&config.app_id)?;
                let bridge_url = config
                    .bridge_url
                    .as_ref()
                    .map(|url| BridgeUrl::new(url, &app_id))
                    .transpose()?;

                Ok(BridgeConnectionParams {
                    app_id,
                    kind: RequestKind::CreateSession,
                    constraints,
                    rp_context: (*config.rp_context).clone(),
                    action_description: config.action_description.clone(),
                    legacy_verification_level,
                    legacy_signal: legacy_signal.unwrap_or_default(),
                    bridge_url,
                    allow_legacy_proofs: false,
                })
            }
            Self::ProveSession { session_id, config } => {
                let app_id = AppId::new(&config.app_id)?;
                let bridge_url = config
                    .bridge_url
                    .as_ref()
                    .map(|url| BridgeUrl::new(url, &app_id))
                    .transpose()?;

                Ok(BridgeConnectionParams {
                    app_id,
                    kind: RequestKind::ProveSession {
                        session_id: session_id.clone(),
                    },
                    constraints,
                    rp_context: (*config.rp_context).clone(),
                    action_description: config.action_description.clone(),
                    legacy_verification_level,
                    legacy_signal: legacy_signal.unwrap_or_default(),
                    bridge_url,
                    allow_legacy_proofs: false,
                })
            }
        }
    }
}

/// Unified builder for creating `IDKit` requests and sessions
#[cfg(feature = "ffi")]
#[derive(uniffi::Object)]
pub struct IDKitBuilder {
    config: IDKitConfig,
}

#[cfg(feature = "ffi")]
#[uniffi::export]
impl IDKitBuilder {
    /// Creates a new builder for uniqueness requests
    #[must_use]
    #[uniffi::constructor(name = "from_request")]
    pub fn from_request(config: IDKitRequestConfig) -> Arc<Self> {
        Arc::new(Self {
            config: IDKitConfig::Request(config),
        })
    }

    /// Creates a new builder for creating a new session
    #[must_use]
    #[uniffi::constructor(name = "from_create_session")]
    pub fn from_create_session(config: IDKitSessionConfig) -> Arc<Self> {
        Arc::new(Self {
            config: IDKitConfig::CreateSession(config),
        })
    }

    /// Creates a new builder for proving an existing session
    #[must_use]
    #[uniffi::constructor(name = "from_prove_session")]
    pub fn from_prove_session(session_id: String, config: IDKitSessionConfig) -> Arc<Self> {
        Arc::new(Self {
            config: IDKitConfig::ProveSession { session_id, config },
        })
    }

    /// Creates a `BridgeConnection` with the given constraints
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created
    #[allow(clippy::needless_pass_by_value)]
    pub fn constraints(
        &self,
        constraints: Arc<ConstraintNode>,
    ) -> std::result::Result<Arc<IDKitRequestWrapper>, crate::error::IdkitError> {
        let runtime =
            tokio::runtime::Runtime::new().map_err(|e| crate::error::IdkitError::BridgeError {
                details: format!("Failed to create runtime: {e}"),
            })?;

        let params = self.config.to_params((*constraints).clone())?;

        let inner = runtime
            .block_on(BridgeConnection::create(params))
            .map_err(crate::error::IdkitError::from)?;

        Ok(Arc::new(IDKitRequestWrapper { runtime, inner }))
    }

    /// Creates a `BridgeConnection` from a preset (works for all request types)
    ///
    /// Presets provide a simplified way to create requests with predefined
    /// credential configurations.
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created
    #[allow(clippy::needless_pass_by_value)]
    pub fn preset(
        &self,
        preset: Preset,
    ) -> std::result::Result<Arc<IDKitRequestWrapper>, crate::error::IdkitError> {
        let runtime =
            tokio::runtime::Runtime::new().map_err(|e| crate::error::IdkitError::BridgeError {
                details: format!("Failed to create runtime: {e}"),
            })?;

        let params = self.config.to_params_from_preset(preset)?;

        let inner = runtime
            .block_on(BridgeConnection::create(params))
            .map_err(crate::error::IdkitError::from)?;

        Ok(Arc::new(IDKitRequestWrapper { runtime, inner }))
    }
}

/// Entry point for creating `IDKit` requests
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
pub fn request(config: IDKitRequestConfig) -> Arc<IDKitBuilder> {
    IDKitBuilder::from_request(config)
}

/// Entry point for creating a new session (no existing `session_id`)
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
pub fn create_session(config: IDKitSessionConfig) -> Arc<IDKitBuilder> {
    IDKitBuilder::from_create_session(config)
}

/// Entry point for proving an existing session
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
pub fn prove_session(session_id: String, config: IDKitSessionConfig) -> Arc<IDKitBuilder> {
    IDKitBuilder::from_prove_session(session_id, config)
}

// UniFFI wrapper for BridgeConnection with tokio runtime
#[cfg(feature = "ffi")]
#[derive(uniffi::Object)]
pub struct IDKitRequestWrapper {
    runtime: tokio::runtime::Runtime,
    inner: BridgeConnection,
}

#[cfg(feature = "ffi")]
#[derive(Debug, Clone, uniffi::Enum)]
pub enum StatusWrapper {
    /// Waiting for World App to retrieve the request
    WaitingForConnection,
    /// World App has retrieved the request, waiting for user confirmation
    AwaitingConfirmation,
    /// User has confirmed and provided proof(s)
    /// For session proofs, `IDKitResult.session_id` will be `Some(id)`
    Confirmed { result: IDKitResult },
    /// Request has failed
    Failed { error: String },
}

#[cfg(feature = "ffi")]
impl From<Status> for StatusWrapper {
    fn from(status: Status) -> Self {
        match status {
            Status::WaitingForConnection => Self::WaitingForConnection,
            Status::AwaitingConfirmation => Self::AwaitingConfirmation,
            Status::Confirmed(result) => Self::Confirmed { result },
            Status::Failed(app_error) => Self::Failed {
                error: app_error.to_string(),
            },
        }
    }
}

#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
impl IDKitRequestWrapper {
    /// Returns the connect URL for World App
    #[must_use]
    pub fn connect_url(&self) -> String {
        self.inner.connect_url()
    }

    /// Returns the request ID for this request
    #[must_use]
    pub fn request_id(&self) -> String {
        self.inner.request_id().to_string()
    }

    /// Polls the request for updates until completion
    pub fn poll_status(
        &self,
        poll_interval_ms: Option<u64>,
        timeout_ms: Option<u64>,
    ) -> StatusWrapper {
        let poll_interval = std::time::Duration::from_millis(poll_interval_ms.unwrap_or(2000));
        let timeout = timeout_ms.map(std::time::Duration::from_millis);

        let mut elapsed = std::time::Duration::from_millis(0);

        loop {
            match self.runtime.block_on(self.inner.poll_for_status()) {
                Ok(status) => match status {
                    Status::WaitingForConnection | Status::AwaitingConfirmation => {
                        if let Some(timeout) = timeout {
                            if elapsed >= timeout {
                                return StatusWrapper::Failed {
                                    error: "Timed out waiting for confirmation".to_string(),
                                };
                            }
                        }
                        std::thread::sleep(poll_interval);
                        elapsed += poll_interval;
                    }
                    Status::Confirmed(result) => {
                        return StatusWrapper::Confirmed { result };
                    }
                    Status::Failed(app_error) => {
                        return StatusWrapper::Failed {
                            error: app_error.to_string(),
                        };
                    }
                },
                Err(err) => {
                    return StatusWrapper::Failed {
                        error: err.to_string(),
                    };
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use alloy_primitives::Signature;

    use super::*;
    use crate::types::{CredentialRequest, CredentialType, Signal};

    #[test]
    fn test_bridge_request_payload_serialization() {
        let item = CredentialRequest::new(CredentialType::Orb, Some(Signal::from_string("test")));
        let constraints = ConstraintNode::item(item);

        // Create a test RpContext with valid hex nonce and signature
        // Note: Signature must be 65 bytes (130 hex chars) in ECDSA format
        let sig_65_bytes = "0x".to_string() + &"00".repeat(64) + "1b"; // r(32) + s(32) + v(1)
        let rp_context = RpContext::new(
            "rp_1234567890abcdef",
            "0x0000000000000000000000000000000000000000000000000000000000000001", // valid field element
            1_700_000_000,
            1_700_003_600,
            &sig_65_bytes,
        )
        .unwrap();

        // Extract protocol types from constraints
        let (request_items, constraint_expr) = constraints.to_protocol_top_level().unwrap();

        // Build proof request - action is converted to field element from raw bytes
        let action = FieldElement::from_arbitrary_raw_bytes(b"test-action");
        let signature = Signature::from_str(&sig_65_bytes).unwrap();
        let nonce = FieldElement::from_str(&rp_context.nonce).unwrap();
        let allow_legacy_proofs = false;
        let proof_request = ProofRequest::new(
            rp_context.created_at,
            rp_context.expires_at,
            rp_context.rp_id,
            Some(action),
            None, // session_id
            signature,
            nonce,
            request_items,
            constraint_expr,
            allow_legacy_proofs,
        );

        let payload = BridgeRequestPayload {
            app_id: "app_test".to_string(),
            action: Some("test-action".to_string()),
            action_description: Some("Test description".to_string()),
            signal: String::new(),
            verification_level: VerificationLevel::Deprecated,
            proof_request,
            allow_legacy_proofs: false,
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("app_test"));
        assert!(json.contains("test-action"));
        assert!(json.contains("verification_level"));
        assert!(json.contains("proof_request"));
        assert!(json.contains("rp_1234567890abcdef"));
        assert!(json.contains("allow_legacy_proofs"));
    }

    #[test]
    fn test_encrypted_payload() {
        #[cfg(feature = "native-crypto")]
        {
            let (key_bytes, nonce_bytes) = crate::crypto::generate_key().unwrap();
            let plaintext = b"test payload";

            let encrypted = encrypt(&key_bytes, &nonce_bytes, plaintext).unwrap();

            let payload = EncryptedPayload {
                iv: base64_encode(&nonce_bytes),
                payload: base64_encode(&encrypted),
            };

            assert!(!payload.iv.is_empty());
            assert!(!payload.payload.is_empty());

            // Verify we can decrypt
            let decrypted_iv = base64_decode(&payload.iv).unwrap();
            let decrypted_cipher = base64_decode(&payload.payload).unwrap();
            let decrypted = decrypt(&key_bytes, &decrypted_iv, &decrypted_cipher).unwrap();

            assert_eq!(decrypted, plaintext);
        }

        #[cfg(not(feature = "native-crypto"))]
        {
            let (key, iv) = crate::crypto::generate_key().unwrap();
            let plaintext = b"test payload";

            let encrypted = encrypt(&key, &iv, plaintext).unwrap();

            let payload = EncryptedPayload {
                iv: base64_encode(&iv),
                payload: base64_encode(&encrypted),
            };

            assert!(!payload.iv.is_empty());
            assert!(!payload.payload.is_empty());

            // Verify we can decrypt
            let decrypted_iv = base64_decode(&payload.iv).unwrap();
            let decrypted_cipher = base64_decode(&payload.payload).unwrap();
            let decrypted = decrypt(&key, &decrypted_iv, &decrypted_cipher).unwrap();

            assert_eq!(decrypted, plaintext);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bridge Response V2 Parsing Tests
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_bridge_response_v2_with_v4_items() {
        let json = r#"{
            "id": "test-id",
            "responses": [
                {
                    "protocol_version": "4.0",
                    "identifier": "orb",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof123",
                    "nullifier": "0xnullifier123",
                    "merkle_root": "0xroot123",
                    "expires_at_min": 1700003600
                }
            ]
        }"#;

        let response: BridgeResponseV2 = serde_json::from_str(json).unwrap();
        assert_eq!(response.responses.len(), 1);

        let item = response
            .responses
            .into_iter()
            .next()
            .unwrap()
            .into_response_item();
        assert!(matches!(item, ResponseItem::V4 { .. }));
        assert_eq!(item.identifier(), "orb");

        if let ResponseItem::V4 {
            proof,
            nullifier,
            merkle_root,
            issuer_schema_id,
            expires_at_min,
            ..
        } = item
        {
            assert_eq!(proof, "0xproof123");
            assert_eq!(nullifier, "0xnullifier123");
            assert_eq!(merkle_root, "0xroot123");
            assert_eq!(issuer_schema_id, "0x1");
            assert_eq!(expires_at_min, 1_700_003_600);
        } else {
            panic!("Expected V4 response item");
        }
    }

    #[test]
    fn test_bridge_response_v2_with_v3_items() {
        let json = r#"{
            "responses": [
                {
                    "protocol_version": "3.0",
                    "proof": "0xproof",
                    "merkle_root": "0xroot",
                    "nullifier_hash": "0xnull",
                    "verification_level": "face"
                }
            ]
        }"#;

        let response: BridgeResponseV2 = serde_json::from_str(json).unwrap();
        assert_eq!(response.responses.len(), 1);

        let item = response
            .responses
            .into_iter()
            .next()
            .unwrap()
            .into_response_item();
        assert!(matches!(item, ResponseItem::V3 { .. }));
        assert_eq!(item.identifier(), "face");
    }

    #[test]
    fn test_bridge_session_response() {
        let json = r#"{
            "id": "test-id",
            "session_id": "session-456",
            "responses": [
                {
                    "identifier": "orb",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof_session",
                    "session_nullifier": "0xsession_null_123",
                    "merkle_root": "0xroot_session",
                    "expires_at_min": 1700003600
                }
            ]
        }"#;

        let response: BridgeSessionResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.session_id, "session-456");
        assert_eq!(response.responses.len(), 1);

        let item = response
            .responses
            .into_iter()
            .next()
            .unwrap()
            .into_response_item();
        assert!(matches!(item, ResponseItem::Session { .. }));
        assert_eq!(item.identifier(), "orb");
        assert_eq!(item.proof(), "0xproof_session");
        assert_eq!(item.nullifier(), "0xsession_null_123");
        assert_eq!(item.merkle_root(), "0xroot_session");
        assert_eq!(item.expires_at_min(), Some(1_700_003_600));
    }

    #[test]
    fn test_bridge_response_detects_session_vs_action() {
        // Session response (has session_id and session_nullifier)
        let session_json = r#"{
            "session_id": "session-123",
            "responses": [
                {
                    "identifier": "orb",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof",
                    "session_nullifier": "0xsession_null",
                    "merkle_root": "0xroot",
                    "expires_at_min": 1700003600
                }
            ]
        }"#;

        let response: BridgeResponse = serde_json::from_str(session_json).unwrap();
        assert!(matches!(response, BridgeResponse::SessionResponse(_)));

        // Action response (has nullifier, no session_id)
        let action_json = r#"{
            "responses": [
                {
                    "protocol_version": "4.0",
                    "identifier": "orb",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof",
                    "nullifier": "0xnullifier",
                    "merkle_root": "0xroot",
                    "expires_at_min": 1700003600
                }
            ]
        }"#;

        let response: BridgeResponse = serde_json::from_str(action_json).unwrap();
        assert!(matches!(response, BridgeResponse::ResponseV2(_)));
    }

    #[test]
    fn test_bridge_response_v2_multi_credential() {
        let json = r#"{
            "responses": [
                {
                    "protocol_version": "4.0",
                    "identifier": "orb",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof1",
                    "nullifier": "0xnull1",
                    "merkle_root": "0xroot1",
                    "expires_at_min": 1700003600
                },
                {
                    "protocol_version": "4.0",
                    "identifier": "document",
                    "issuer_schema_id": "0x4",
                    "proof": "0xproof2",
                    "nullifier": "0xnull2",
                    "merkle_root": "0xroot2",
                    "expires_at_min": 1700003601
                }
            ]
        }"#;

        let response: BridgeResponseV2 = serde_json::from_str(json).unwrap();
        assert_eq!(response.responses.len(), 2);

        let items: Vec<_> = response
            .responses
            .into_iter()
            .map(BridgeResponseItem::into_response_item)
            .collect();

        assert_eq!(items.len(), 2);
        assert!(items
            .iter()
            .all(|item| matches!(item, ResponseItem::V4 { .. })));

        assert_eq!(items[0].identifier(), "orb");
        assert_eq!(items[1].identifier(), "document");
    }

    #[test]
    fn test_bridge_response_v2_deserialization() {
        let json = r#"{
            "responses": [
                {
                    "protocol_version": "4.0",
                    "identifier": "orb",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof",
                    "nullifier": "0xnull",
                    "merkle_root": "0xroot",
                    "expires_at_min": 1700003600
                }
            ]
        }"#;

        let response: BridgeResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(response, BridgeResponse::ResponseV2(_)));
    }

    #[test]
    fn test_bridge_response_v1_deserialization() {
        let json = r#"{
            "proof": "0xproof",
            "merkle_root": "0xroot",
            "nullifier_hash": "0xnull",
            "verification_level": "orb"
        }"#;

        let response: BridgeResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(response, BridgeResponse::ResponseV1(_)));
    }

    #[test]
    fn test_bridge_response_error_deserialization() {
        let json = r#"{"error_code": "user_rejected"}"#;

        let response: BridgeResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(response, BridgeResponse::Error { .. }));
    }

    #[test]
    fn test_parse_issuer_schema_id() {
        assert_eq!(
            parse_issuer_schema_id("0x1").and_then(CredentialType::from_issuer_schema_id),
            Some(CredentialType::Orb)
        );
        assert_eq!(
            parse_issuer_schema_id("0x2").and_then(CredentialType::from_issuer_schema_id),
            Some(CredentialType::Face)
        );
        assert_eq!(
            parse_issuer_schema_id("0x3").and_then(CredentialType::from_issuer_schema_id),
            Some(CredentialType::SecureDocument)
        );
        assert_eq!(
            parse_issuer_schema_id("0x4").and_then(CredentialType::from_issuer_schema_id),
            Some(CredentialType::Document)
        );
        assert_eq!(
            parse_issuer_schema_id("0x5").and_then(CredentialType::from_issuer_schema_id),
            Some(CredentialType::Device)
        );
        assert_eq!(
            parse_issuer_schema_id("1").and_then(CredentialType::from_issuer_schema_id),
            Some(CredentialType::Orb)
        );
        assert_eq!(
            parse_issuer_schema_id("0x99").and_then(CredentialType::from_issuer_schema_id),
            None
        );
    }
}
