//! High-level session management for World ID verification

use crate::{
    bridge::{BridgeClient, BridgeConfig, Status},
    types::{AppId, BridgeUrl, Credential, Proof, Request, VerificationLevel},
    Constraints, ConstraintNode, Error, Result,
};
use std::time::Duration;
use tokio::time::sleep;

/// Configuration for creating a World ID verification session
#[derive(Debug, Clone)]
pub struct SessionConfig {
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
    pub bridge_url: Option<BridgeUrl>,
}

impl SessionConfig {
    /// Creates a new session config with required fields
    #[must_use]
    pub fn new(app_id: AppId, action: impl Into<String>) -> Self {
        Self {
            app_id,
            action: action.into(),
            action_description: None,
            requests: Vec::new(),
            constraints: None,
            bridge_url: None,
        }
    }

    /// Adds an action description
    #[must_use]
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.action_description = Some(description.into());
        self
    }

    /// Adds a single request
    #[must_use]
    pub fn with_request(mut self, request: Request) -> Self {
        self.requests.push(request);
        self
    }

    /// Sets all requests
    #[must_use]
    pub fn with_requests(mut self, requests: Vec<Request>) -> Self {
        self.requests = requests;
        self
    }

    /// Sets constraints
    #[must_use]
    pub fn with_constraints(mut self, constraints: Constraints) -> Self {
        self.constraints = Some(constraints);
        self
    }

    /// Sets the bridge URL
    #[must_use]
    pub fn with_bridge_url(mut self, url: BridgeUrl) -> Self {
        self.bridge_url = Some(url);
        self
    }

    /// Creates a session config from a legacy verification level
    ///
    /// This provides backward compatibility with the old API
    #[must_use]
    pub fn from_verification_level(
        app_id: AppId,
        action: impl Into<String>,
        verification_level: VerificationLevel,
        signal: impl Into<String>,
    ) -> Self {
        let signal_str = signal.into();
        let credentials = verification_level.to_credentials();

        let requests = credentials
            .iter()
            .map(|cred| Request::new(*cred, crate::crypto::encode_signal_str(&signal_str)))
            .collect();

        let constraints = Constraints::new(ConstraintNode::any(
            credentials
                .into_iter()
                .map(ConstraintNode::credential)
                .collect(),
        ));

        Self {
            app_id,
            action: action.into(),
            action_description: None,
            requests,
            constraints: Some(constraints),
            bridge_url: None,
        }
    }
}

/// A World ID verification session
pub struct Session {
    client: BridgeClient,
}

impl Session {
    /// Creates a new session from configuration
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created
    pub async fn create(config: SessionConfig) -> Result<Self> {
        let bridge_config = BridgeConfig {
            app_id: config.app_id,
            action: config.action,
            action_description: config.action_description,
            requests: config.requests,
            constraints: config.constraints,
            bridge_url: config.bridge_url.unwrap_or_else(BridgeUrl::default),
        };

        let client = BridgeClient::create(bridge_config).await?;

        Ok(Self { client })
    }

    /// Returns the connect URL that should be presented to the user
    #[must_use]
    pub fn connect_url(&self) -> String {
        self.client.connect_url()
    }

    /// Polls for the current status once
    ///
    /// # Errors
    ///
    /// Returns an error if the poll request fails
    pub async fn poll(&self) -> Result<Status> {
        self.client.poll_status().await
    }

    /// Waits for a proof, polling the bridge until completion
    ///
    /// # Errors
    ///
    /// Returns an error if polling fails or the verification fails
    pub async fn wait_for_proof(&self) -> Result<Proof> {
        self.wait_for_proof_with_timeout(Duration::from_secs(300))
            .await
    }

    /// Waits for a proof with a timeout
    ///
    /// # Errors
    ///
    /// Returns an error if polling fails, verification fails, or timeout is reached
    pub async fn wait_for_proof_with_timeout(&self, timeout: Duration) -> Result<Proof> {
        let start = tokio::time::Instant::now();
        let poll_interval = Duration::from_secs(3);

        loop {
            if start.elapsed() > timeout {
                return Err(Error::Timeout);
            }

            match self.poll().await? {
                Status::Confirmed(proof) => return Ok(proof),
                Status::Failed(error) => return Err(Error::AppError(error)),
                Status::WaitingForConnection | Status::AwaitingConfirmation => {
                    sleep(poll_interval).await;
                }
            }
        }
    }

    /// Returns the request ID for this session
    #[must_use]
    pub fn request_id(&self) -> String {
        self.client.request_id().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_config_builder() {
        let app_id = AppId::new("app_test").unwrap();
        let config = SessionConfig::new(app_id.clone(), "test_action")
            .with_description("Test description")
            .with_request(Request::new(
                Credential::Orb,
                crate::crypto::encode_signal_str("test"),
            ))
            .with_constraints(Constraints::any(vec![Credential::Orb]));

        assert_eq!(config.action, "test_action");
        assert_eq!(config.action_description, Some("Test description".to_string()));
        assert_eq!(config.requests.len(), 1);
        assert!(config.constraints.is_some());
    }

    #[test]
    fn test_session_config_from_verification_level() {
        let app_id = AppId::new("app_test").unwrap();
        let config = SessionConfig::from_verification_level(
            app_id,
            "test_action",
            VerificationLevel::Device,
            "test_signal",
        );

        assert_eq!(config.requests.len(), 2); // Orb and Device
        assert!(config.constraints.is_some());
    }
}
