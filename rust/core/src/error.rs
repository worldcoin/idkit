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
    #[cfg(any(feature = "bridge", feature = "bridge-wasm"))]
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

/// Errors returned by the World App
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "conformance", derive(strum::EnumIter))]
pub enum AppError {
    /// User rejected the request
    #[error("User rejected the request")]
    UserRejected,

    /// Verification rejected
    /// Legacy error, it's replaced by `UserRejected` in the new Bridge Protocol
    #[error("Verification rejected")]
    VerificationRejected,

    /// Credential unavailable
    #[error("Requested credential is not available")]
    CredentialUnavailable,

    /// Requested feature is not enabled for the app
    #[error("Requested feature is not available")]
    FeatureUnavailable,

    /// World ID 4.0 credential is not available
    #[error("World ID 4.0 is not available")]
    #[serde(rename = "world_id_4_not_available")]
    WorldId4NotAvailable,

    /// World ID 3.0 credential is not available
    #[error("World ID 3.0 is not available")]
    #[serde(rename = "world_id_3_not_available")]
    WorldId3NotAvailable,

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

    /// Maximum verifications reached
    #[error("Maximum verifications reached")]
    MaxVerificationsReached,

    /// Verification failed by host app
    #[error("Verification failed by host app")]
    FailedByHostApp,

    /// User presence check failed or was not completed
    #[error("User presence check failed")]
    UserPresenceFailed,

    /// RP signature is invalid
    #[error("Invalid RP signature")]
    InvalidRpSignature,

    /// Nullifier was already used
    #[error("Nullifier was already used")]
    NullifierReplayed,

    /// RP reused a signature nonce
    #[error("Duplicate RP signature nonce")]
    DuplicateNonce,

    /// RP is unknown to the registry
    #[error("Unknown RP")]
    UnknownRp,

    /// RP is inactive
    #[error("Inactive RP")]
    InactiveRp,

    /// RP request timestamp is too old
    #[error("Timestamp is too old")]
    TimestampTooOld,

    /// RP request timestamp is too far in the future
    #[error("Timestamp is too far in the future")]
    TimestampTooFarInFuture,

    /// RP request timestamp is invalid
    #[error("Invalid timestamp")]
    InvalidTimestamp,

    /// RP signature has expired
    #[error("RP signature expired")]
    RpSignatureExpired,

    /// Identity attributes did not match the required values
    #[error("Identity attributes not matched")]
    // An early android version using this error code instead of `identity_attributes_not_matched`
    #[serde(alias = "identity_attribute_mismatch")]
    IdentityAttributesNotMatched,

    /// Generic error
    #[error("An error occurred")]
    #[serde(other)]
    GenericError,
}

impl AppError {
    /// Parses a raw World App/bridge error code.
    #[must_use]
    pub fn from_code(code: &str) -> Self {
        match code {
            "user_rejected" => Self::UserRejected,
            "verification_rejected" => Self::VerificationRejected,
            "credential_unavailable" => Self::CredentialUnavailable,
            "feature_unavailable" => Self::FeatureUnavailable,
            "world_id_4_not_available" => Self::WorldId4NotAvailable,
            "world_id_3_not_available" => Self::WorldId3NotAvailable,
            "malformed_request" => Self::MalformedRequest,
            "invalid_network" => Self::InvalidNetwork,
            "inclusion_proof_pending" => Self::InclusionProofPending,
            "inclusion_proof_failed" => Self::InclusionProofFailed,
            "unexpected_response" => Self::UnexpectedResponse,
            "connection_failed" => Self::ConnectionFailed,
            "max_verifications_reached" => Self::MaxVerificationsReached,
            "failed_by_host_app" => Self::FailedByHostApp,
            "user_presence_failed" => Self::UserPresenceFailed,
            "invalid_rp_signature" => Self::InvalidRpSignature,
            "nullifier_replayed" | "nullifier_replay" => Self::NullifierReplayed,
            "duplicate_nonce" => Self::DuplicateNonce,
            "unknown_rp" => Self::UnknownRp,
            "inactive_rp" => Self::InactiveRp,
            "timestamp_too_old" => Self::TimestampTooOld,
            "timestamp_too_far_in_future" => Self::TimestampTooFarInFuture,
            "invalid_timestamp" => Self::InvalidTimestamp,
            "rp_signature_expired" => Self::RpSignatureExpired,
            // An early android version using this error code instead of `identity_attributes_not_matched`
            "identity_attributes_not_matched" | "identity_attribute_mismatch" => {
                Self::IdentityAttributesNotMatched
            }
            _ => Self::GenericError,
        }
    }
}

/// Why a Deep Face challenge failed, sent by World App as the optional bridge `reason`
/// next to `error_code`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "conformance", derive(strum::EnumIter))]
pub enum DeepFaceFailureReason {
    /// The challenge image failed quality checks or could not be decoded
    #[error("Challenge image failed quality checks")]
    FaceChallengeQuality,

    /// The face in the challenge image does not match the user
    #[error("Challenge image does not match the user")]
    FaceChallengeMismatch,

    /// The request had no challenge image
    #[error("Challenge image is missing")]
    FaceChallengeMissing,

    /// The challenge image digest did not match
    #[error("Challenge image digest mismatch")]
    FaceChallengeIntegrity,

    /// The live selfie failed quality checks
    #[error("Selfie failed quality checks")]
    FaceSelfieQuality,

    /// The live selfie does not match the user's enrolled face
    #[error("Selfie does not match the enrolled face")]
    FaceSelfieMismatch,

    /// The live selfie capture timed out
    #[error("Selfie capture timed out")]
    FaceSelfieTimeout,

    /// The live selfie was flagged as a spoof
    #[error("Spoof detected")]
    SpoofDetected,

    /// The user's estimated age is below the required threshold
    #[error("Age below threshold")]
    AgeBelowThreshold,

    /// The username in the request does not match the user
    #[error("Username mismatch")]
    UsernameMismatch,

    /// Device biometric (Face ID, fingerprint) failed or is locked out
    #[error("Device biometric rejected")]
    BiometricRejected,

    /// The user cancelled or closed the flow
    #[error("User cancelled")]
    UserCancelled,

    /// Proof generation failed
    #[error("Proof generation failed")]
    ProofFailed,

    /// The required credential is not available on the device
    #[error("Credential unavailable")]
    CredentialUnavailable,

    /// The user's personal custody package (enrolled face data) is missing
    #[error("Personal custody package is missing")]
    PcpMissing,

    /// Face auth configuration was rejected or unavailable
    #[error("Face auth unavailable")]
    FaceAuthUnavailable,

    /// Face auth failed for another reason
    #[error("Face auth failed")]
    FaceAuthFailed,

    /// The request metadata could not be loaded
    #[error("Request metadata could not be loaded")]
    MetadataFailed,

    /// A network call or verifier timed out
    #[error("Network error")]
    NetworkError,

    /// The verification service rejected the request
    #[error("Verification service rejected the request")]
    ServerRejected,

    /// The app hit an unexpected local error
    #[error("Unexpected client error")]
    ClientError,

    /// Unrecognized reason
    #[error("Unknown reason")]
    #[serde(other)]
    Unknown,
}

impl DeepFaceFailureReason {
    /// Parses a raw Deep Face bridge `reason`.
    #[must_use]
    pub fn from_code(code: &str) -> Self {
        serde_json::from_value(serde_json::Value::String(code.to_owned())).unwrap_or(Self::Unknown)
    }
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
            Error::InvalidConfiguration(message) => Self::InvalidConfiguration { details: message },
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
            #[cfg(any(feature = "bridge", feature = "bridge-wasm"))]
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
            IdkitError::CryptoError { details } => Self::Crypto(details),
            IdkitError::InvalidProof { details } => Self::InvalidProof(details),
            IdkitError::JsonError { details }
            | IdkitError::Base64Error { details }
            | IdkitError::UrlError { details }
            | IdkitError::BridgeError { details }
            | IdkitError::AppError { details } => Self::BridgeError(details),
            IdkitError::UnexpectedResponse => Self::UnexpectedResponse,
            IdkitError::ConnectionFailed => Self::ConnectionFailed,
            IdkitError::Timeout => Self::Timeout,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::DeepFaceFailureReason as R;

    const WIRE: [(&str, R); 22] = [
        ("face_challenge_quality", R::FaceChallengeQuality),
        ("face_challenge_mismatch", R::FaceChallengeMismatch),
        ("face_challenge_missing", R::FaceChallengeMissing),
        ("face_challenge_integrity", R::FaceChallengeIntegrity),
        ("face_selfie_quality", R::FaceSelfieQuality),
        ("face_selfie_mismatch", R::FaceSelfieMismatch),
        ("face_selfie_timeout", R::FaceSelfieTimeout),
        ("spoof_detected", R::SpoofDetected),
        ("age_below_threshold", R::AgeBelowThreshold),
        ("username_mismatch", R::UsernameMismatch),
        ("biometric_rejected", R::BiometricRejected),
        ("user_cancelled", R::UserCancelled),
        ("proof_failed", R::ProofFailed),
        ("credential_unavailable", R::CredentialUnavailable),
        ("pcp_missing", R::PcpMissing),
        ("face_auth_unavailable", R::FaceAuthUnavailable),
        ("face_auth_failed", R::FaceAuthFailed),
        ("metadata_failed", R::MetadataFailed),
        ("network_error", R::NetworkError),
        ("server_rejected", R::ServerRejected),
        ("client_error", R::ClientError),
        ("unknown", R::Unknown),
    ];

    #[test]
    fn deep_face_failure_reason_round_trips_wire_strings() {
        for (code, reason) in WIRE {
            assert_eq!(serde_json::to_value(reason).unwrap(), code);
            assert_eq!(serde_json::from_value::<R>(code.into()).unwrap(), reason);
            assert_eq!(R::from_code(code), reason);
        }
    }

    #[cfg(feature = "conformance")]
    #[test]
    fn deep_face_failure_reason_wire_table_covers_every_variant() {
        use strum::IntoEnumIterator;
        assert_eq!(R::iter().count(), WIRE.len());
    }

    #[test]
    fn deep_face_failure_reason_parses_unrecognized_as_unknown() {
        for code in ["process_challenge_failed", "", "FACE_SELFIE_QUALITY"] {
            assert_eq!(R::from_code(code), R::Unknown);
            assert_eq!(
                serde_json::from_value::<R>(code.into()).unwrap(),
                R::Unknown
            );
        }
    }
}
