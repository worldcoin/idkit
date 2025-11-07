//! Session management for World ID verification with the [Wallet Bridge](https://github.com/worldcoin/wallet-bridge).

use crate::{
    crypto::{base64_decode, base64_encode, decrypt, encrypt},
    error::{AppError, Error, Result},
    types::{AppId, BridgeUrl, Proof, Request, Signal, VerificationLevel},
    ConstraintNode, Constraints,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[cfg(feature = "native-crypto")]
use crate::crypto::CryptoKey;

/// Bridge request payload sent to initialize a session
#[derive(Debug, Serialize)]
struct BridgeRequestPayload {
    /// Application ID from the Developer Portal
    app_id: String,

    /// Action ID from the Developer Portal
    action: String,

    /// Optional action description
    #[serde(skip_serializing_if = "Option::is_none")]
    action_description: Option<String>,

    /// Set of requests
    requests: Vec<Request>,

    /// Optional constraints
    #[serde(skip_serializing_if = "Option::is_none")]
    constraints: Option<Constraints>,
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

impl Session {
    /// Creates a new session
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `requests` - One or more credential requests
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    pub async fn create(
        app_id: AppId,
        action: impl Into<String>,
        requests: Vec<Request>,
    ) -> Result<Self> {
        Self::create_with_options(app_id, action, requests, None, None, None).await
    }

    /// Creates a new session with optional configuration
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `requests` - One or more credential requests
    /// * `action_description` - Optional action description shown to users
    /// * `constraints` - Optional constraints on which credentials are acceptable
    /// * `bridge_url` - Optional bridge URL (defaults to production)
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    #[allow(clippy::too_many_arguments)]
    pub async fn create_with_options(
        app_id: AppId,
        action: impl Into<String>,
        requests: Vec<Request>,
        action_description: Option<String>,
        constraints: Option<Constraints>,
        bridge_url: Option<BridgeUrl>,
    ) -> Result<Self> {
        // Validate requests
        for req in &requests {
            req.validate()?;
        }

        if let Some(ref constraints) = constraints {
            constraints.validate()?;
        }

        let bridge_url = bridge_url.unwrap_or_default();

        // Generate encryption key and IV
        #[cfg(feature = "native-crypto")]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        #[cfg(feature = "native-crypto")]
        let key = CryptoKey::new(key_bytes, nonce_bytes);

        #[cfg(not(feature = "native-crypto"))]
        let (key_bytes, nonce_bytes) = crate::crypto::generate_key()?;

        // Prepare the payload
        let payload = BridgeRequestPayload {
            app_id: app_id.as_str().to_string(),
            action: action.into(),
            action_description,
            requests: requests.clone(),
            constraints,
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

    /// Creates a session from a verification level
    ///
    /// This is a convenience method that maps a verification level (like "device" or "orb")
    /// to the appropriate set of credential requests and constraints.
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    pub async fn from_verification_level(
        app_id: AppId,
        action: impl Into<String>,
        verification_level: VerificationLevel,
        signal: impl Into<String>,
    ) -> Result<Self> {
        let signal_str = signal.into();
        let credentials = verification_level.to_credentials();

        let requests = credentials
            .iter()
            .map(|cred| Request::new(*cred, Some(Signal::from_string(signal_str.clone()))))
            .collect();

        let constraints = Constraints::new(ConstraintNode::any(
            credentials
                .into_iter()
                .map(ConstraintNode::credential)
                .collect(),
        ));

        Self::create_with_options(app_id, action, requests, None, Some(constraints), None).await
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::CredentialType;

    #[test]
    fn test_bridge_request_payload_serialization() {
        let request = Request::new(CredentialType::Orb, Some(Signal::from_string("test")));
        let payload = BridgeRequestPayload {
            app_id: "app_test".to_string(),
            action: "test_action".to_string(),
            action_description: Some("Test description".to_string()),
            requests: vec![request],
            constraints: None,
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("app_test"));
        assert!(json.contains("test_action"));
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