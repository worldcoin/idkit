//! Session management for World ID verification with the [Wallet Bridge](https://github.com/worldcoin/wallet-bridge).

use crate::{
    crypto::{base64_decode, base64_encode, decrypt, encrypt},
    error::{AppError, Error, Result},
    preset::Preset,
    protocol_types::ProofRequest,
    types::{AppId, BridgeUrl, Proof, Request, RpContext, VerificationLevel},
    Constraints, Signal,
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
}

/// Builds a `ProofRequest` from `RpContext`, requests, constraints, and action.
fn build_proof_request(
    rp_context: &RpContext,
    requests: &[Request],
    action: &str,
    constraints: Option<&Constraints>,
) -> Result<ProofRequest> {
    use crate::protocol_types::RequestItem;

    // Convert requests to RequestItems
    let request_items: Vec<RequestItem> = requests
        .iter()
        .map(Request::to_request_item)
        .collect::<Result<Vec<_>>>()?;

    // Convert constraints to protocol expression if provided
    let protocol_constraints = constraints.map(crate::Constraints::to_protocol_expr);

    let action = FieldElement::from_arbitrary_raw_bytes(action.as_bytes());
    let signature = Signature::from_str(&rp_context.signature)
        .map_err(|_| Error::InvalidConfiguration("Invalid signature".to_string()))?;
    // TODO: Once we add a utility function for rp signature and nonce generation, update this
    let nonce = FieldElement::from_arbitrary_raw_bytes(rp_context.nonce.as_bytes());

    // Build ProofRequest using the RpContext
    Ok(ProofRequest::new(
        rp_context.created_at,
        rp_context.expires_at,
        rp_context.rp_id,
        action,
        signature,
        nonce,
        request_items,
        protocol_constraints,
    ))
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

/// Decrypted response from the World App
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum BridgeResponse {
    /// Error response
    Error { error_code: AppError },

    /// Success response with proof
    Success(Proof),
}

/// Status of a verification request
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    /// Waiting for World App to retrieve the request
    WaitingForConnection,

    /// World App has retrieved the request, waiting for user confirmation
    AwaitingConfirmation,

    /// User has confirmed and provided a proof
    Confirmed(Proof),

    /// Request has failed
    Failed(AppError),
}

/// A World ID verification session
///
/// Manages the verification flow with World App via the bridge.
pub struct Session {
    bridge_url: BridgeUrl,
    #[cfg(feature = "native-crypto")]
    key: CryptoKey,
    key_bytes: Vec<u8>,
    request_id: Uuid,
    client: reqwest::Client,
}

// TODO: Let's explore alternatives for requests/constraints, and add syntactic sugar for the better DevEx
impl Session {
    /// Creates a new session with full configuration
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `requests` - One or more credential requests
    /// * `rp_context` - RP context for building protocol-level `ProofRequest`
    /// * `action_description` - Optional action description shown to users
    /// * `constraints` - Optional constraints on which credentials are acceptable
    /// * `legacy_verification_level` - Optional legacy verification level for World App 3.0 compatibility
    /// * `legacy_signal` - Optional legacy signal for World App 3.0 compatibility
    /// * `bridge_url` - Optional bridge URL (defaults to production)
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    #[allow(clippy::too_many_arguments)]
    // TODO: Add Preset.OrbCompatible to support backwards compatibility with World ID 3.0
    pub async fn create(
        app_id: AppId,
        action: impl Into<String>,
        requests: Vec<Request>,
        rp_context: RpContext,
        action_description: Option<String>,
        constraints: Option<Constraints>,
        legacy_verification_level: Option<VerificationLevel>,
        legacy_signal: Option<String>,
        bridge_url: Option<BridgeUrl>,
    ) -> Result<Self> {
        if let Some(ref constraints) = constraints {
            constraints.validate()?;
        }

        let bridge_url = bridge_url.unwrap_or_default();
        let action_str = action.into();

        // Generate encryption key and IV
        #[cfg(feature = "native-crypto")]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        #[cfg(feature = "native-crypto")]
        let key = CryptoKey::new(key_bytes, nonce_bytes);

        #[cfg(not(feature = "native-crypto"))]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        // Build ProofRequest from RpContext
        let proof_request =
            build_proof_request(&rp_context, &requests, &action_str, constraints.as_ref())?;

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

    /// Creates a new session from a preset
    ///
    /// Presets provide a simplified way to create sessions with predefined
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
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    pub async fn create_from_preset(
        app_id: AppId,
        action: impl Into<String>,
        preset: Preset,
        rp_context: RpContext,
        action_description: Option<String>,
        bridge_url: Option<BridgeUrl>,
    ) -> Result<Self> {
        let (requests, constraints, legacy_verification_level, legacy_signal) =
            preset.to_bridge_params();

        Self::create(
            app_id,
            action,
            requests,
            rp_context,
            action_description,
            constraints,
            Some(legacy_verification_level),
            legacy_signal,
            bridge_url,
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
                    BridgeResponse::Success(proof) => Ok(Status::Confirmed(proof)),
                }
            }
            _ => Err(Error::UnexpectedResponse),
        }
    }

    /// Returns the request ID for this session
    #[must_use]
    pub const fn request_id(&self) -> Uuid {
        self.request_id
    }
}

// UniFFI wrapper for Session with tokio runtime
#[cfg(feature = "ffi")]
#[derive(uniffi::Object)]
pub struct SessionWrapper {
    runtime: tokio::runtime::Runtime,
    inner: Session,
}

#[cfg(feature = "ffi")]
#[derive(Debug, Clone, uniffi::Enum)]
pub enum StatusWrapper {
    /// Waiting for World App to retrieve the request
    WaitingForConnection,
    /// World App has retrieved the request, waiting for user confirmation
    AwaitingConfirmation,
    /// User has confirmed and provided a proof
    Confirmed { proof: Proof },
    /// Request has failed
    Failed { error: String },
}

#[cfg(feature = "ffi")]
impl From<Status> for StatusWrapper {
    fn from(status: Status) -> Self {
        match status {
            Status::WaitingForConnection => Self::WaitingForConnection,
            Status::AwaitingConfirmation => Self::AwaitingConfirmation,
            Status::Confirmed(proof) => Self::Confirmed { proof },
            Status::Failed(app_error) => Self::Failed {
                error: app_error.to_string(),
            },
        }
    }
}

#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
// TODO: Let's explore a builder pattern to improve DevEx
impl SessionWrapper {
    /// Creates a new session
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `requests` - One or more credential requests
    /// * `rp_context` - RP context for building protocol-level `ProofRequest`
    /// * `action_description` - Optional action description shown to users
    /// * `constraints` - Optional constraints on which credentials are acceptable
    /// * `bridge_url` - Optional bridge URL (defaults to production)
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    #[uniffi::constructor]
    #[allow(clippy::too_many_arguments)]
    pub fn create(
        app_id: String,
        action: String,
        requests: Vec<Arc<Request>>,
        rp_context: Arc<RpContext>,
        action_description: Option<String>,
        constraints: Option<Arc<Constraints>>,
        bridge_url: Option<String>,
    ) -> std::result::Result<Self, crate::error::IdkitError> {
        let runtime =
            tokio::runtime::Runtime::new().map_err(|e| crate::error::IdkitError::BridgeError {
                details: format!("Failed to create runtime: {e}"),
            })?;

        let app_id_parsed = AppId::new(&app_id)?;
        let core_requests: Vec<Request> = requests.iter().map(|r| (**r).clone()).collect();
        let core_constraints = constraints.map(|c| (*c).clone());
        let bridge_url_parsed = bridge_url
            .map(|url| BridgeUrl::new(&url, &app_id_parsed))
            .transpose()?;
        let core_rp_context = (*rp_context).clone();

        let inner = runtime
            .block_on(Session::create(
                app_id_parsed,
                action,
                core_requests,
                core_rp_context,
                action_description,
                core_constraints,
                None, // legacy_verification_level
                None, // legacy_signal
                bridge_url_parsed,
            ))
            .map_err(crate::error::IdkitError::from)?;

        Ok(Self { runtime, inner })
    }

    /// Creates a new session from a preset
    ///
    /// Presets provide a simplified way to create sessions with predefined
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
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    #[uniffi::constructor]
    pub fn create_from_preset(
        app_id: String,
        action: String,
        preset: Preset,
        rp_context: Arc<RpContext>,
        action_description: Option<String>,
        bridge_url: Option<String>,
    ) -> std::result::Result<Self, crate::error::IdkitError> {
        let runtime =
            tokio::runtime::Runtime::new().map_err(|e| crate::error::IdkitError::BridgeError {
                details: format!("Failed to create runtime: {e}"),
            })?;

        let app_id_parsed = AppId::new(&app_id)?;
        let bridge_url_parsed = bridge_url
            .map(|url| BridgeUrl::new(&url, &app_id_parsed))
            .transpose()?;
        let core_rp_context = (*rp_context).clone();

        let inner = runtime
            .block_on(Session::create_from_preset(
                app_id_parsed,
                action,
                preset,
                core_rp_context,
                action_description,
                bridge_url_parsed,
            ))
            .map_err(crate::error::IdkitError::from)?;

        Ok(Self { runtime, inner })
    }

    /// Returns the connect URL for World App
    #[must_use]
    pub fn connect_url(&self) -> String {
        self.inner.connect_url()
    }

    /// Returns the request ID for this session
    #[must_use]
    pub fn request_id(&self) -> String {
        self.inner.request_id().to_string()
    }

    /// Polls the session for updates until completion
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
                    Status::Confirmed(proof) => {
                        return StatusWrapper::Confirmed { proof };
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
    use super::*;
    use crate::types::{CredentialType, Signal};

    #[test]
    fn test_bridge_request_payload_serialization() {
        let request = Request::new(CredentialType::Orb, Some(Signal::from_string("test")));
        let requests = vec![request];

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

        // Build proof request - action is converted to field element from raw bytes
        let proof_request =
            build_proof_request(&rp_context, &requests, "test-action", None).unwrap();

        let payload = BridgeRequestPayload {
            app_id: "app_test".to_string(),
            action: "test-action".to_string(),
            action_description: Some("Test description".to_string()),
            signal: String::new(),
            verification_level: VerificationLevel::Deprecated,
            proof_request,
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("app_test"));
        assert!(json.contains("test-action"));
        assert!(json.contains("verification_level"));
        assert!(json.contains("proof_request"));
        assert!(json.contains("rp_1234567890abcdef"));
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
}
