//! Error types for `IDKit`

use thiserror::Error;

/// Result type alias for `IDKit` operations
pub type Result<T> = std::result::Result<T, Error>;

/// Errors that can occur when using `IDKit`
#[derive(Debug, Error)]
pub enum Error {
    /// Invalid configuration provided
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),

    /// Bridge communication error
    #[error("Bridge error: {0}")]
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

    /// HTTP request error
    #[cfg(feature = "bridge")]
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

/// Errors returned by the World App
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum AppError {
    /// User rejected the request
    #[error("User rejected the request")]
    UserRejected,

    /// Credential unavailable
    #[error("Requested credential is not available")]
    CredentialUnavailable,

    /// Malformed request
    #[error("Request is malformed")]
    MalformedRequest,

    /// Invalid network
    #[error("Invalid network")]
    InvalidNetwork,

    /// Inclusion proof pending
    #[error("Inclusion proof is still pending")]
    InclusionProofPending,

    /// Inclusion proof failed
    #[error("Inclusion proof failed")]
    InclusionProofFailed,

    /// Unexpected response
    #[error("Unexpected response from World App")]
    UnexpectedResponse,

    /// Connection failed
    #[error("Failed to connect to World App")]
    ConnectionFailed,

    /// Generic error
    #[error("An error occurred")]
    GenericError,
}
