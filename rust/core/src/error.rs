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

    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}
