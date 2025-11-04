//! Proof verification utilities
//!
//! This module provides utilities for validating and preparing World ID proofs.
//! Phase 1: Local validation only. Network verification will be added in Phase 2.

use crate::{
    crypto::hash_to_field,
    types::{AppId, Proof},
    Error, Result,
};

/// Validates a World ID proof structure
///
/// Performs local validation of the proof fields without making network calls.
/// For full verification against the World ID smart contract, use the
/// Developer Portal API (to be added in Phase 2).
///
/// # Arguments
///
/// * `proof` - The proof to validate
/// * `app_id` - Your application ID
/// * `action` - The action identifier
/// * `signal` - Optional signal data (if empty, no signal validation is performed)
///
/// # Errors
///
/// Returns an error if the proof structure is invalid
pub fn verify_proof(
    proof: &Proof,
    app_id: &AppId,
    action: &str,
    _signal: &[u8],
) -> Result<()> {
    // Validate app_id format
    if !app_id.as_str().starts_with("app_") {
        return Err(Error::InvalidConfiguration(
            "app_id must start with 'app_'".to_string(),
        ));
    }

    // Validate action is not empty
    if action.is_empty() {
        return Err(Error::InvalidConfiguration(
            "action cannot be empty".to_string(),
        ));
    }

    // Validate proof fields are not empty
    if proof.proof.is_empty() {
        return Err(Error::InvalidProof("proof cannot be empty".to_string()));
    }

    if proof.merkle_root.is_empty() {
        return Err(Error::InvalidProof(
            "merkle_root cannot be empty".to_string(),
        ));
    }

    if proof.nullifier_hash.is_empty() {
        return Err(Error::InvalidProof(
            "nullifier_hash cannot be empty".to_string(),
        ));
    }

    // Validate hex string format (should start with 0x)
    if !proof.proof.starts_with("0x") {
        return Err(Error::InvalidProof(
            "proof must be a hex string starting with 0x".to_string(),
        ));
    }

    if !proof.merkle_root.starts_with("0x") {
        return Err(Error::InvalidProof(
            "merkle_root must be a hex string starting with 0x".to_string(),
        ));
    }

    if !proof.nullifier_hash.starts_with("0x") {
        return Err(Error::InvalidProof(
            "nullifier_hash must be a hex string starting with 0x".to_string(),
        ));
    }

    // All basic validations passed
    Ok(())
}

/// Computes the signal hash for verification
///
/// # Arguments
///
/// * `signal` - The signal bytes to hash
///
/// # Returns
///
/// The signal hash as a hex string with 0x prefix
#[must_use]
pub fn compute_signal_hash(signal: &[u8]) -> String {
    if signal.is_empty() {
        return String::new();
    }
    format!("0x{:064x}", hash_to_field(signal))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Credential;

    #[test]
    fn test_verify_proof_valid() {
        let app_id = AppId::new("app_test_123").unwrap();
        let proof = Proof {
            proof: "0x123abc".to_string(),
            merkle_root: "0x456def".to_string(),
            nullifier_hash: "0x789ghi".to_string(),
            verification_level: Credential::Orb,
        };

        assert!(verify_proof(&proof, &app_id, "test_action", b"signal").is_ok());
    }

    #[test]
    fn test_verify_proof_empty_action() {
        let app_id = AppId::new("app_test_123").unwrap();
        let proof = Proof {
            proof: "0x123".to_string(),
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: Credential::Orb,
        };

        assert!(verify_proof(&proof, &app_id, "", b"signal").is_err());
    }

    #[test]
    fn test_verify_proof_invalid_hex() {
        let app_id = AppId::new("app_test_123").unwrap();
        let proof = Proof {
            proof: "123".to_string(), // Missing 0x prefix
            merkle_root: "0x456".to_string(),
            nullifier_hash: "0x789".to_string(),
            verification_level: Credential::Orb,
        };

        assert!(verify_proof(&proof, &app_id, "action", b"signal").is_err());
    }

    #[test]
    fn test_compute_signal_hash() {
        let hash = compute_signal_hash(b"test_signal");
        assert!(hash.starts_with("0x"));
        assert_eq!(hash.len(), 66); // 0x + 64 hex chars

        let empty_hash = compute_signal_hash(b"");
        assert_eq!(empty_hash, "");
    }
}
