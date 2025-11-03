//! Error types for IDKit

use thiserror::Error;

/// Result type alias for IDKit operations
pub type Result<T> = std::result::Result<T, Error>;

/// Errors that can occur when using IDKit
#[derive(Debug, Error)]
pub enum Error {
    /// Invalid configuration provided
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),

    /// Bridge communication error
    #[error("Bridge error: {0}")]
    #[cfg(feature = "bridge-client")]
    Bridge(#[from] reqwest::Error),

    /// Bridge communication error (WASM)
    #[error("Bridge error: {0}")]
    #[cfg(not(feature = "bridge-client"))]
    BridgeError(String),

    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Encryption/decryption error
    #[error("Cryptography error: {0}")]
    Crypto(String),

    /// Base64 encoding/decoding error
    #[error("Base64 error: {0}")]
    Base64(#[from] base64::DecodeError),

    /// URL parsing error
    #[error("URL error: {0}")]
    Url(#[from] url::ParseError),

    /// App-level error from World App
    #[error("App error: {0:?}")]
    AppError(AppError),

    /// Unexpected response from bridge
    #[error("Unexpected response from bridge")]
    UnexpectedResponse,

    /// Connection failed
    #[error("Connection to bridge failed")]
    ConnectionFailed,

    /// Request timed out
    #[error("Request timed out")]
    Timeout,

    /// Invalid proof
    #[error("Invalid proof: {0}")]
    InvalidProof(String),
}

/// Errors returned by the World App
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum AppError {
    /// User rejected the request
    UserRejected,

    /// Credential unavailable
    CredentialUnavailable,

    /// Malformed request
    MalformedRequest,

    /// Invalid network
    InvalidNetwork,

    /// Inclusion proof pending
    InclusionProofPending,

    /// Inclusion proof failed
    InclusionProofFailed,

    /// Unexpected response
    UnexpectedResponse,

    /// Connection failed
    ConnectionFailed,

    /// Generic error
    GenericError,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UserRejected => write!(f, "User rejected the request"),
            Self::CredentialUnavailable => write!(f, "Requested credential is not available"),
            Self::MalformedRequest => write!(f, "Request is malformed"),
            Self::InvalidNetwork => write!(f, "Invalid network"),
            Self::InclusionProofPending => write!(f, "Inclusion proof is still pending"),
            Self::InclusionProofFailed => write!(f, "Inclusion proof failed"),
            Self::UnexpectedResponse => write!(f, "Unexpected response from World App"),
            Self::ConnectionFailed => write!(f, "Failed to connect to World App"),
            Self::GenericError => write!(f, "An error occurred"),
        }
    }
}
