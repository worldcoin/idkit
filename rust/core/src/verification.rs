//! Backend proof verification using the Developer Portal API

use crate::{
    crypto::hash_to_field,
    types::{AppId, Credential, Proof},
    Error, Result,
};
use serde::{Deserialize, Serialize};

/// Request sent to the verification API
#[derive(Debug, Serialize)]
struct VerificationRequest {
    /// Action identifier
    action: String,

    /// The proof string
    proof: String,

    /// Merkle root
    merkle_root: String,

    /// Nullifier hash
    nullifier_hash: String,

    /// Verification level (credential type)
    verification_level: Credential,

    /// Optional signal hash
    #[serde(skip_serializing_if = "Option::is_none")]
    signal_hash: Option<String>,
}

/// Error response from the verification API
#[derive(Debug, Deserialize)]
struct ErrorResponse {
    /// Error code
    code: String,

    /// Error detail
    detail: String,

    /// Optional attribute that caused the error (unused but part of API response)
    #[allow(dead_code)]
    attribute: Option<String>,
}

/// Verifies a World ID proof using the Developer Portal API
///
/// # Arguments
///
/// * `proof` - The proof to verify
/// * `app_id` - Your application ID
/// * `action` - The action identifier
/// * `signal` - Optional signal data (if empty, no signal validation is performed)
///
/// # Errors
///
/// Returns an error if verification fails or there's a network/API error
pub async fn verify_proof(
    proof: Proof,
    app_id: &AppId,
    action: &str,
    signal: &[u8],
) -> Result<()> {
    let signal_hash = if signal.is_empty() {
        None
    } else {
        Some(format!("0x{}", hex::encode(hash_to_field(signal))))
    };

    let request = VerificationRequest {
        action: action.to_string(),
        proof: proof.proof,
        merkle_root: proof.merkle_root,
        nullifier_hash: proof.nullifier_hash,
        verification_level: proof.verification_level,
        signal_hash,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "https://developer.worldcoin.org/api/v2/verify/{}",
            app_id.as_str()
        ))
        .header("User-Agent", "idkit-core/3.0.0")
        .json(&request)
        .send()
        .await?;

    match response.status().as_u16() {
        200 => Ok(()),
        400 => {
            let error: ErrorResponse = response.json().await?;
            Err(Error::InvalidProof(format!(
                "{}: {}",
                error.code, error.detail
            )))
        }
        _ => Err(Error::UnexpectedResponse),
    }
}

/// Verifies a proof with a string signal
///
/// # Errors
///
/// Returns an error if verification fails
pub async fn verify_proof_with_signal(
    proof: Proof,
    app_id: &AppId,
    action: &str,
    signal: &str,
) -> Result<()> {
    verify_proof(proof, app_id, action, signal.as_bytes()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verification_request_serialization() {
        let request = VerificationRequest {
            action: "test".to_string(),
            proof: "0x123".to_string(),
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: Credential::Orb,
            signal_hash: Some("0xabc".to_string()),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("test"));
        assert!(json.contains("0x123"));
    }

    #[test]
    fn test_verification_request_no_signal() {
        let request = VerificationRequest {
            action: "test".to_string(),
            proof: "0x123".to_string(),
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: Credential::Orb,
            signal_hash: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(!json.contains("signal_hash"));
    }
}
