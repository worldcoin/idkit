//! UniFFI bindings for IDKit
//!
//! This crate generates Swift and Kotlin bindings for the core IDKit library.
//!
//! Note: This uses a blocking runtime wrapper to make async Session work with UniFFI.

use idkit_core::{
    bridge::Status as CoreStatus,
    session::{Session, SessionConfig},
    AppId, Proof, Request, VerificationLevel,
};
use std::sync::{Arc, Mutex};
use tokio::runtime::Runtime;

/// Error type for UniFFI
#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum IdkitError {
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Cryptography error: {0}")]
    CryptoError(String),
    #[error("Application error: {0}")]
    AppError(String),
    #[error("Timeout")]
    Timeout,
    #[error("Invalid proof: {0}")]
    InvalidProof(String),
}

impl From<idkit_core::Error> for IdkitError {
    fn from(e: idkit_core::Error) -> Self {
        match e {
            idkit_core::Error::InvalidConfiguration(s) => IdkitError::InvalidConfiguration(s),
            idkit_core::Error::Timeout => IdkitError::Timeout,
            idkit_core::Error::InvalidProof(s) => IdkitError::InvalidProof(s),
            idkit_core::Error::AppError(e) => IdkitError::AppError(e.to_string()),
            _ => IdkitError::NetworkError(e.to_string()),
        }
    }
}

/// Request configuration for UniFFI (wrapper around core Request)
#[derive(Clone, uniffi::Record)]
pub struct RequestConfig {
    pub credential_type: idkit_core::Credential,
    pub signal: String,
    pub face_auth: Option<bool>,
}

impl From<RequestConfig> for Request {
    fn from(config: RequestConfig) -> Self {
        let mut request = Request::new(config.credential_type, config.signal);
        if let Some(fa) = config.face_auth {
            request = request.with_face_auth(fa);
        }
        request
    }
}

/// Session status
#[derive(Clone, uniffi::Enum)]
pub enum SessionStatus {
    WaitingForConnection,
    AwaitingConfirmation,
    Confirmed { proof: Proof },
    Failed { error: String },
}

/// IDKit session for verification
///
/// This wraps the async Session in a blocking interface for UniFFI compatibility.
#[derive(uniffi::Object)]
pub struct IdkitSession {
    runtime: Arc<Mutex<Runtime>>,
    session: Arc<Session>,
}

#[uniffi::export]
impl IdkitSession {
    /// Creates a new session from verification level (legacy API)
    #[uniffi::constructor]
    pub fn from_verification_level(
        app_id: String,
        action: String,
        verification_level: VerificationLevel,
        signal: String,
    ) -> Result<Self, IdkitError> {
        let app_id = AppId::new(app_id)?;
        let config = SessionConfig::from_verification_level(app_id, action, verification_level, signal);

        // Create runtime for blocking async operations
        let runtime = Runtime::new().map_err(|e| {
            IdkitError::InvalidConfiguration(format!("Failed to create runtime: {}", e))
        })?;

        // Create session using blocking runtime
        let session = runtime.block_on(Session::create(config))?;

        Ok(Self {
            runtime: Arc::new(Mutex::new(runtime)),
            session: Arc::new(session),
        })
    }

    /// Creates a new session with requests
    #[uniffi::constructor]
    pub fn with_requests(
        app_id: String,
        action: String,
        requests: Vec<RequestConfig>,
    ) -> Result<Self, IdkitError> {
        let app_id = AppId::new(app_id)?;

        let mut config = SessionConfig::new(app_id, action);
        for req in requests {
            config = config.with_request(req.into());
        }

        // Create runtime for blocking async operations
        let runtime = Runtime::new().map_err(|e| {
            IdkitError::InvalidConfiguration(format!("Failed to create runtime: {}", e))
        })?;

        // Create session using blocking runtime
        let session = runtime.block_on(Session::create(config))?;

        Ok(Self {
            runtime: Arc::new(Mutex::new(runtime)),
            session: Arc::new(session),
        })
    }

    /// Get the connect URL for the World App
    pub fn connect_url(&self) -> String {
        self.session.connect_url()
    }

    /// Poll for the current status (blocking)
    pub fn poll(&self) -> Result<SessionStatus, IdkitError> {
        let runtime = self.runtime.lock().unwrap();
        let status = runtime.block_on(self.session.poll())?;

        Ok(match status {
            CoreStatus::WaitingForConnection => SessionStatus::WaitingForConnection,
            CoreStatus::AwaitingConfirmation => SessionStatus::AwaitingConfirmation,
            CoreStatus::Confirmed(proof) => SessionStatus::Confirmed { proof },
            CoreStatus::Failed(err) => SessionStatus::Failed {
                error: err.to_string(),
            },
        })
    }

    /// Wait for a proof (blocking, with optional timeout in milliseconds)
    pub fn wait_for_proof(&self, timeout_ms: Option<u64>) -> Result<Proof, IdkitError> {
        let runtime = self.runtime.lock().unwrap();

        let proof = if let Some(ms) = timeout_ms {
            runtime.block_on(
                self.session
                    .wait_for_proof_with_timeout(std::time::Duration::from_millis(ms)),
            )?
        } else {
            // Default 2 minute timeout
            runtime.block_on(self.session.wait_for_proof())?
        };

        Ok(proof)
    }
}

/// Initialize the library
#[uniffi::export]
pub fn init() {
    // Initialization logic if needed
}

// Generate UniFFI scaffolding
uniffi::setup_scaffolding!();
