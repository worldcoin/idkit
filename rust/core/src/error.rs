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
    #[cfg(any(feature = "bridge", feature = "bridge-wasm", feature = "verification"))]
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

/// Errors returned by the World App
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
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

// UniFFI error type wrapper
#[cfg(feature = "ffi")]
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum IdkitError {
    /// Invalid configuration provided
    #[error("Invalid configuration: {details}")]
    InvalidConfiguration { details: String },

    /// JSON serialization/deserialization error
    #[error("JSON error: {details}")]
    JsonError { details: String },

    /// Cryptographic operation error
    #[error("Cryptography error: {details}")]
    CryptoError { details: String },

    /// Base64 encoding/decoding error
    #[error("Base64 error: {details}")]
    Base64Error { details: String },

    /// URL parsing error
    #[error("URL error: {details}")]
    UrlError { details: String },

    /// Invalid proof provided
    #[error("Invalid proof: {details}")]
    InvalidProof { details: String },

    /// Bridge communication error
    #[error("Bridge error: {details}")]
    BridgeError { details: String },

    /// Application-level error
    #[error("App error: {details}")]
    AppError { details: String },

    /// Unexpected response from bridge
    #[error("Unexpected response from bridge")]
    UnexpectedResponse,

    /// Connection to bridge failed
    #[error("Connection to bridge failed")]
    ConnectionFailed,

    /// Request timed out
    #[error("Request timed out")]
    Timeout,
}

#[cfg(feature = "ffi")]
impl From<Error> for IdkitError {
    fn from(e: Error) -> Self {
        match e {
            Error::InvalidConfiguration(message) => {
                Self::InvalidConfiguration { details: message }
            }
            Error::Json(err) => Self::JsonError {
                details: err.to_string(),
            },
            Error::Crypto(message) => Self::CryptoError { details: message },
            Error::Base64(err) => Self::Base64Error {
                details: err.to_string(),
            },
            Error::Url(err) => Self::UrlError {
                details: err.to_string(),
            },
            Error::InvalidProof(message) => Self::InvalidProof { details: message },
            Error::BridgeError(message) => Self::BridgeError { details: message },
            Error::AppError(app_err) => Self::AppError {
                details: app_err.to_string(),
            },
            Error::UnexpectedResponse => Self::UnexpectedResponse,
            Error::ConnectionFailed => Self::ConnectionFailed,
            Error::Timeout => Self::Timeout,
            #[cfg(any(feature = "bridge", feature = "bridge-wasm", feature = "verification"))]
            Error::Http(err) => Self::BridgeError {
                details: format!("HTTP error: {err}"),
            },
        }
    }
}

#[cfg(feature = "ffi")]
impl From<IdkitError> for Error {
    fn from(e: IdkitError) -> Self {
        match e {
            IdkitError::InvalidConfiguration { details } => Self::InvalidConfiguration(details),
            IdkitError::JsonError { details } => Self::BridgeError(details),
            IdkitError::CryptoError { details } => Self::Crypto(details),
            IdkitError::Base64Error { details } => Self::BridgeError(details),
            IdkitError::UrlError { details } => Self::BridgeError(details),
            IdkitError::InvalidProof { details } => Self::InvalidProof(details),
            IdkitError::BridgeError { details } => Self::BridgeError(details),
            IdkitError::AppError { details } => Self::BridgeError(details),
            IdkitError::UnexpectedResponse => Self::UnexpectedResponse,
            IdkitError::ConnectionFailed => Self::ConnectionFailed,
            IdkitError::Timeout => Self::Timeout,
        }
    }
}
