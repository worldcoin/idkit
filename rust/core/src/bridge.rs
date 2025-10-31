//! Bridge client for communicating with the World App Bridge

use crate::{
    crypto::{base64_decode, base64_encode, decrypt, encrypt, encode_signal_str},
    error::{AppError, Error, Result},
    types::{AppId, BridgeUrl, Credential, Proof, Request},
    Constraints,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Bridge request payload sent to initialize a session
#[derive(Debug, Serialize)]
struct BridgeRequestPayload {
    /// Application ID
    app_id: String,

    /// Action identifier
    action: String,

    /// Optional action description
    #[serde(skip_serializing_if = "Option::is_none")]
    action_description: Option<String>,

    /// Requests array
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
    Success(BridgeProof),
}

/// Proof response from bridge
#[derive(Debug, Deserialize)]
struct BridgeProof {
    proof: String,
    merkle_root: String,
    nullifier_hash: String,
    verification_level: Credential,
}

impl From<BridgeProof> for Proof {
    fn from(bp: BridgeProof) -> Self {
        Self {
            proof: bp.proof,
            merkle_root: bp.merkle_root,
            nullifier_hash: bp.nullifier_hash,
            verification_level: bp.verification_level,
        }
    }
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

/// Bridge client configuration
#[derive(Debug, Clone)]
pub struct BridgeConfig {
    /// Application ID
    pub app_id: AppId,

    /// Action identifier
    pub action: String,

    /// Optional action description shown to users
    pub action_description: Option<String>,

    /// Credential requests
    pub requests: Vec<Request>,

    /// Optional constraints on which credentials are acceptable
    pub constraints: Option<Constraints>,

    /// Bridge URL (defaults to production)
    pub bridge_url: BridgeUrl,
}

/// Bridge client for managing World ID verification sessions
pub struct BridgeClient {
    config: BridgeConfig,
    key: Vec<u8>,
    iv: Vec<u8>,
    request_id: Uuid,
    client: reqwest::Client,
}

impl BridgeClient {
    /// Creates a new bridge client and initializes a session
    ///
    /// # Errors
    ///
    /// Returns an error if the request fails or the response is invalid
    pub async fn create(config: BridgeConfig) -> Result<Self> {
        // Validate configuration
        for request in &config.requests {
            request.validate()?;
        }

        if let Some(ref constraints) = config.constraints {
            constraints.validate()?;
        }

        // Generate encryption key and IV
        let (key, iv) = crate::crypto::generate_key()?;

        // Prepare the payload
        let payload = BridgeRequestPayload {
            app_id: config.app_id.as_str().to_string(),
            action: config.action.clone(),
            action_description: config.action_description.clone(),
            requests: config.requests.clone(),
            constraints: config.constraints.clone(),
        };

        let payload_json = serde_json::to_vec(&payload)?;

        // Encrypt the payload
        let encrypted = encrypt(&key, &iv, &payload_json)?;

        let encrypted_payload = EncryptedPayload {
            iv: base64_encode(&iv),
            payload: base64_encode(&encrypted),
        };

        // Send to bridge
        let client = reqwest::Client::builder()
            .user_agent("idkit-core/3.0.0")
            .build()?;

        let response = client
            .post(config.bridge_url.join("/request")?)
            .json(&encrypted_payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(Error::ConnectionFailed);
        }

        let create_response: BridgeCreateResponse = response.json().await?;

        Ok(Self {
            config,
            key,
            iv,
            request_id: create_response.request_id,
            client,
        })
    }

    /// Returns the connect URL for the World App
    #[must_use]
    pub fn connect_url(&self) -> String {
        let key_b64 = base64_encode(&self.key);
        let bridge_param = if self.config.bridge_url == BridgeUrl::default() {
            String::new()
        } else {
            format!("&b={}", urlencoding::encode(self.config.bridge_url.as_str()))
        };

        format!(
            "https://worldcoin.org/verify?t=wld&i={}&k={}{}",
            self.request_id,
            urlencoding::encode(&key_b64),
            bridge_param
        )
    }

    /// Polls the bridge for the current status
    ///
    /// # Errors
    ///
    /// Returns an error if the request fails or the response is invalid
    pub async fn poll_status(&self) -> Result<Status> {
        let response = self
            .client
            .get(self.config.bridge_url.join(&format!("/response/{}", self.request_id))?)
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
                let encrypted = poll_response
                    .response
                    .ok_or(Error::UnexpectedResponse)?;

                let iv = base64_decode(&encrypted.iv)?;
                let ciphertext = base64_decode(&encrypted.payload)?;

                let plaintext = decrypt(&self.key, &iv, &ciphertext)?;

                let bridge_response: BridgeResponse = serde_json::from_slice(&plaintext)?;

                match bridge_response {
                    BridgeResponse::Error { error_code } => Ok(Status::Failed(error_code)),
                    BridgeResponse::Success(proof) => Ok(Status::Confirmed(proof.into())),
                }
            }
            _ => Err(Error::UnexpectedResponse),
        }
    }

    /// Returns the request ID
    #[must_use]
    pub fn request_id(&self) -> Uuid {
        self.request_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Credential;

    #[test]
    fn test_bridge_request_payload_serialization() {
        let request = Request::new(Credential::Orb, encode_signal_str("test"));
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
