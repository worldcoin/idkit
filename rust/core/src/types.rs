//! Core types for the `IDKit` protocol

use serde::{Deserialize, Serialize};

/// Credential types that can be requested
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Enum))]
#[serde(rename_all = "snake_case")]
pub enum Credential {
    /// Orb credential
    Orb,
    /// Face credential
    Face,
    /// Secure NFC document with active or passive authentication, or a Japanese MNC
    SecureDocument,
    /// NFC document without authentication
    Document,
    /// Device-based credential
    Device,
}

/// A single credential request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Record))]
pub struct Request {
    /// The type of credential being requested
    #[serde(rename = "type")]
    pub credential_type: Credential,

    /// The signal to be included in the proof (unique per request)
    pub signal: String,

    /// Whether face authentication is required (only valid for orb and face credentials)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub face_auth: Option<bool>,
}

/// The proof of verification returned by the World ID protocol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "uniffi-bindings", derive(uniffi::Record))]
pub struct Proof {
    /// The Zero-knowledge proof of the verification (hex string, ABI encoded)
    pub proof: String,

    /// Hash pointer to the root of the Merkle tree (hex string, ABI encoded)
    pub merkle_root: String,

    /// User's unique identifier for the app and action (hex string, ABI encoded)
    pub nullifier_hash: String,

    /// The verification level used
    pub verification_level: Credential,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_serialization() {
        let cred = Credential::Orb;
        let json = serde_json::to_string(&cred).unwrap();
        assert_eq!(json, r#""orb""#);

        let deserialized: Credential = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, Credential::Orb);
    }

    #[test]
    fn test_request_serialization() {
        let request = Request {
            credential_type: Credential::Orb,
            signal: "test_signal".to_string(),
            face_auth: Some(true),
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("orb"));
        assert!(json.contains("test_signal"));
    }

    #[test]
    fn test_proof_serialization() {
        let proof = Proof {
            proof: "0x123".to_string(),
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: Credential::Orb,
        };
        let json = serde_json::to_string(&proof).unwrap();
        assert!(json.contains("0x123"));
        assert!(json.contains("orb"));
    }
}
