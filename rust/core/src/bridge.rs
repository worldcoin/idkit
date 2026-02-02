//! `IDKitRequest` management for World ID verification with the [Wallet Bridge](https://github.com/worldcoin/wallet-bridge).

use crate::{
    crypto::{base64_decode, base64_encode, decrypt, encrypt},
    error::{AppError, Error, Result},
    preset::Preset,
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

/// Bridge request payload sent to initialize a session
#[derive(Debug, Serialize)]
struct BridgeRequestPayload {
    // ---------------------------------------------------
    // -- Legacy fields for World ID 3.0 compatibility --
    // ---------------------------------------------------
    /// Application ID from the Developer Portal
    app_id: String,

    /// Action ID from the Developer Portal
    action: String,

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
#[derive(Debug, Deserialize)]
#[serde(tag = "protocol_version")]
enum BridgeResponseItem {
    #[serde(rename = "4.0")]
    V4 {
        issuer_schema_id: String,
        proof: String,
        nullifier: String,
        merkle_root: String,
        proof_timestamp: u64,
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
    fn into_response_item(self) -> ResponseItem {
        match self {
            Self::V4 {
                issuer_schema_id,
                proof,
                nullifier,
                merkle_root,
                proof_timestamp,
            } => {
                let identifier = parse_issuer_schema_id(&issuer_schema_id)
                    .and_then(CredentialType::from_issuer_schema_id)
                    .unwrap_or(CredentialType::Orb);
                ResponseItem::V4 {
                    identifier,
                    proof,
                    nullifier,
                    merkle_root,
                    proof_timestamp,
                    issuer_schema_id,
                }
            }
            Self::V3 {
                proof,
                merkle_root,
                nullifier_hash,
                verification_level,
            } => ResponseItem::V3 {
                identifier: verification_level,
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
            identifier: self.verification_level,
            proof: self.proof,
            merkle_root: self.merkle_root,
            nullifier_hash: self.nullifier_hash,
        }
    }
}

/// V2 bridge response with multi-credential support
#[derive(Debug, Deserialize)]
struct BridgeResponseV2 {
    #[allow(dead_code)]
    id: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
    responses: Vec<BridgeResponseItem>,
}

/// Parse `issuer_schema_id` string as hex u64
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

    /// V2 response with multi-credential support (World ID 4.0)
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
    Confirmed(IDKitResult),

    /// Request has failed
    Failed(AppError),
}

/// A World ID verification request
///
/// Manages the verification flow with World App via the bridge.
pub struct IDKitRequest {
    bridge_url: BridgeUrl,
    #[cfg(feature = "native-crypto")]
    key: CryptoKey,
    key_bytes: Vec<u8>,
    request_id: Uuid,
    client: reqwest::Client,
}

impl IDKitRequest {
    /// Creates a new request with constraint-based configuration
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `constraints` - Constraint tree containing credential requests
    /// * `rp_context` - RP context for building protocol-level `ProofRequest`
    /// * `action_description` - Optional action description shown to users
    /// * `bridge_url` - Optional bridge URL (defaults to production)
    /// * `allow_legacy_proofs` - Whether to accept legacy (v3) proofs as fallback
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created or the bridge call fails
    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        app_id: AppId,
        action: impl Into<String>,
        constraints: ConstraintNode,
        rp_context: RpContext,
        action_description: Option<String>,
        legacy_verification_level: Option<VerificationLevel>,
        legacy_signal: Option<String>,
        bridge_url: Option<BridgeUrl>,
        allow_legacy_proofs: bool,
    ) -> Result<Self> {
        // Validate constraints
        constraints.validate()?;

        let bridge_url = bridge_url.unwrap_or_default();
        let action_str = action.into();

        // Generate encryption key and IV
        #[cfg(feature = "native-crypto")]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        #[cfg(feature = "native-crypto")]
        let key = CryptoKey::new(key_bytes, nonce_bytes);

        #[cfg(not(feature = "native-crypto"))]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        // Build ProofRequest protocol type
        // TODO: Import it from world-id-protocol crate once it's WASM compatible
        let (request_items, constraint_expr) = constraints.to_protocol_top_level()?;
        let action = FieldElement::from_arbitrary_raw_bytes(action_str.as_bytes());
        let signature = Signature::from_str(&rp_context.signature)
            .map_err(|_| Error::InvalidConfiguration("Invalid signature".to_string()))?;
        let nonce = FieldElement::from_str(&rp_context.nonce)
            .map_err(|_| Error::InvalidConfiguration("Invalid nonce format".to_string()))?;
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

        // For backwards compatibility we encode the hash of the signal
        // and default to empty string if it's not provided
        // Source: https://github.com/worldcoin/idkit-js/blob/main/packages/core/src/bridge.ts#L82C7-L82C45
        let legacy_signal_hash =
            crate::crypto::encode_signal(&Signal::from_string(legacy_signal.unwrap_or_default()));

        // Prepare the payload
        let payload = BridgeRequestPayload {
            app_id: app_id.as_str().to_string(),
            action: action_str,
            action_description,
            proof_request,
            // By default we only want to interact with World ID 4.0
            // we use an invalid verification level to ensure users on older World App versions
            // respond with an error.
            verification_level: legacy_verification_level.unwrap_or(VerificationLevel::Deprecated),
            signal: legacy_signal_hash,
            allow_legacy_proofs,
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

    /// Creates a new request from a preset
    ///
    /// Presets provide a simplified way to create requests with predefined
    /// credential configurations. The preset is converted to both World ID 4.0
    /// requests and World ID 3.0 legacy fields for backward compatibility.
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `preset` - Credential preset (e.g., `OrbLegacy`)
    /// * `rp_context` - RP context for building protocol-level `ProofRequest`
    /// * `action_description` - Optional action description shown to users
    /// * `bridge_url` - Optional bridge URL (defaults to production)
    /// * `allow_legacy_proofs` - Whether to accept legacy (v3) proofs as fallback
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created or the bridge call fails
    pub async fn create_from_preset(
        app_id: AppId,
        action: impl Into<String>,
        preset: Preset,
        rp_context: RpContext,
        action_description: Option<String>,
        bridge_url: Option<BridgeUrl>,
        allow_legacy_proofs: bool,
    ) -> Result<Self> {
        let (constraints, legacy_verification_level, legacy_signal) = preset.to_bridge_params();

        Self::create(
            app_id,
            action,
            constraints,
            rp_context,
            action_description,
            Some(legacy_verification_level),
            legacy_signal,
            bridge_url,
            allow_legacy_proofs,
        )
        .await
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
                            response.session_id,
                            responses,
                        )))
                    }
                    BridgeResponse::ResponseV1(response) => {
                        // V1 responses are always protocol 3.0
                        let item = response.into_response_item();
                        Ok(Status::Confirmed(IDKitResult::new("3.0", None, vec![item])))
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

/// Builder for creating `IDKit` requests
#[cfg(feature = "ffi")]
#[derive(uniffi::Object)]
pub struct IDKitRequestBuilder {
    config: IDKitRequestConfig,
}

#[cfg(feature = "ffi")]
#[uniffi::export]
impl IDKitRequestBuilder {
    /// Creates a new `IDKitRequestBuilder` with the given configuration
    #[must_use]
    #[uniffi::constructor]
    pub fn new(config: IDKitRequestConfig) -> Arc<Self> {
        Arc::new(Self { config })
    }

    /// Creates an `IDKit` request with the given constraints
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

        let app_id = AppId::new(&self.config.app_id)?;
        let bridge_url = self
            .config
            .bridge_url
            .as_ref()
            .map(|url| BridgeUrl::new(url, &app_id))
            .transpose()?;
        let rp_context = (*self.config.rp_context).clone();

        let inner = runtime
            .block_on(IDKitRequest::create(
                app_id,
                &self.config.action,
                (*constraints).clone(),
                rp_context,
                self.config.action_description.clone(),
                None, // legacy_verification_level - not needed for explicit constraints
                None, // legacy_signal - not needed for explicit constraints
                bridge_url,
                self.config.allow_legacy_proofs,
            ))
            .map_err(crate::error::IdkitError::from)?;

        Ok(Arc::new(IDKitRequestWrapper { runtime, inner }))
    }

    /// Creates an `IDKit` request from a preset
    ///
    /// Presets provide a simplified way to create requests with predefined
    /// credential configurations. The preset is converted to both World ID 4.0
    /// constraints and World ID 3.0 legacy fields for backward compatibility.
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

        let app_id = AppId::new(&self.config.app_id)?;
        let bridge_url = self
            .config
            .bridge_url
            .as_ref()
            .map(|url| BridgeUrl::new(url, &app_id))
            .transpose()?;
        let rp_context = (*self.config.rp_context).clone();

        // Convert preset to constraints + legacy params
        let (constraints, legacy_verification_level, legacy_signal) = preset.to_bridge_params();

        let inner = runtime
            .block_on(IDKitRequest::create(
                app_id,
                &self.config.action,
                constraints,
                rp_context,
                self.config.action_description.clone(),
                Some(legacy_verification_level),
                legacy_signal,
                bridge_url,
                self.config.allow_legacy_proofs,
            ))
            .map_err(crate::error::IdkitError::from)?;

        Ok(Arc::new(IDKitRequestWrapper { runtime, inner }))
    }
}

/// Entry point for creating `IDKit` requests
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
pub fn request(config: IDKitRequestConfig) -> Arc<IDKitRequestBuilder> {
    IDKitRequestBuilder::new(config)
}

// UniFFI wrapper for IDKitRequest with tokio runtime
#[cfg(feature = "ffi")]
#[derive(uniffi::Object)]
pub struct IDKitRequestWrapper {
    runtime: tokio::runtime::Runtime,
    inner: IDKitRequest,
}

#[cfg(feature = "ffi")]
#[derive(Debug, Clone, uniffi::Enum)]
pub enum StatusWrapper {
    /// Waiting for World App to retrieve the request
    WaitingForConnection,
    /// World App has retrieved the request, waiting for user confirmation
    AwaitingConfirmation,
    /// User has confirmed and provided proof(s)
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
            action: "test-action".to_string(),
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
            "session_id": "session-123",
            "responses": [
                {
                    "protocol_version": "4.0",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof123",
                    "nullifier": "0xnullifier123",
                    "merkle_root": "0xroot123",
                    "proof_timestamp": 1700000000
                }
            ]
        }"#;

        let response: BridgeResponseV2 = serde_json::from_str(json).unwrap();
        assert_eq!(response.session_id.as_ref().unwrap(), "session-123");
        assert_eq!(response.responses.len(), 1);

        let item = response
            .responses
            .into_iter()
            .next()
            .unwrap()
            .into_response_item();
        assert!(matches!(item, ResponseItem::V4 { .. }));
        assert_eq!(item.identifier(), CredentialType::Orb);

        if let ResponseItem::V4 {
            proof,
            nullifier,
            merkle_root,
            proof_timestamp,
            issuer_schema_id,
            ..
        } = item
        {
            assert_eq!(proof, "0xproof123");
            assert_eq!(nullifier, "0xnullifier123");
            assert_eq!(merkle_root, "0xroot123");
            assert_eq!(proof_timestamp, 1_700_000_000);
            assert_eq!(issuer_schema_id, "0x1");
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
        assert!(response.session_id.is_none());
        assert_eq!(response.responses.len(), 1);

        let item = response
            .responses
            .into_iter()
            .next()
            .unwrap()
            .into_response_item();
        assert!(matches!(item, ResponseItem::V3 { .. }));
        assert_eq!(item.identifier(), CredentialType::Face);
    }

    #[test]
    fn test_bridge_response_v2_multi_credential() {
        let json = r#"{
            "responses": [
                {
                    "protocol_version": "4.0",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof1",
                    "nullifier": "0xnull1",
                    "merkle_root": "0xroot1",
                    "proof_timestamp": 1700000000
                },
                {
                    "protocol_version": "4.0",
                    "issuer_schema_id": "0x4",
                    "proof": "0xproof2",
                    "nullifier": "0xnull2",
                    "merkle_root": "0xroot2",
                    "proof_timestamp": 1700000001
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

        assert_eq!(items[0].identifier(), CredentialType::Orb);
        assert_eq!(items[1].identifier(), CredentialType::Document);
    }

    #[test]
    fn test_bridge_response_v2_deserialization() {
        let json = r#"{
            "responses": [
                {
                    "protocol_version": "4.0",
                    "issuer_schema_id": "0x1",
                    "proof": "0xproof",
                    "nullifier": "0xnull",
                    "merkle_root": "0xroot",
                    "proof_timestamp": 1700000000
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
