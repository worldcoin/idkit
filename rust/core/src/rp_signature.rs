//! RP Signature generation for World ID
//!
//! This module is only available when the `rp-signature` feature is enabled.

use crate::error::{Error, Result};
use getrandom::getrandom;
use k256::ecdsa::SigningKey;
use tiny_keccak::{Hasher, Keccak};
use world_id_primitives::FieldElement;

// Re-export for compute_rp_signature_msg which needs BigInteger conversion
use ark_ff::{BigInteger as _, PrimeField as _};

/// RP signature result containing all components needed for verification
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct RpSignature {
    /// The signature in hex format (0x-prefixed, 65 bytes: r || s || v)
    pub sig: String,
    /// The nonce in hex format (0x-prefixed field element)
    pub nonce: String,
    /// Unix timestamp when the signature was created
    pub created_at: u64,
}

/// Computes the message to be signed for the RP signature.
///
/// The message format is: `nonce || action || timestamp` (72 bytes total).
/// - `nonce`: 32 bytes (big-endian)
/// - `action`: 32 bytes (big-endian)
/// - `timestamp`: 8 bytes (big-endian)
#[must_use]
pub fn compute_rp_signature_msg(
    nonce: FieldElement,
    action: FieldElement,
    timestamp: u64,
) -> Vec<u8> {
    let mut msg = Vec::new();
    msg.extend((*nonce).into_bigint().to_bytes_be());
    msg.extend((*action).into_bigint().to_bytes_be());
    msg.extend(timestamp.to_be_bytes());
    msg
}

/// Computes the RP signature for a proof request.
///
/// This function:
/// 1. Generates a random nonce
/// 2. Gets the current unix timestamp
/// 3. Computes the message: nonce || action || timestamp (72 bytes)
/// 4. Hashes the message with keccak256
/// 5. Signs the hash with ECDSA secp256k1
///
/// # Arguments
/// * `signing_key_hex` - Hex-encoded 32-byte private key (with or without 0x prefix)
/// * `action` - The action field element
///
/// # Returns
/// `Result<RpSignature>` containing the signature, nonce, and timestamp
///
/// # Errors
/// Returns an error if:
/// - The signing key is invalid hex or wrong length
/// - Random number generation fails
/// - System time is before UNIX epoch
/// - Signing operation fails
pub fn compute_rp_signature(signing_key_hex: &str, action: FieldElement) -> Result<RpSignature> {
    // 1. Parse signing key
    let hex_str = signing_key_hex
        .strip_prefix("0x")
        .unwrap_or(signing_key_hex);
    let key_bytes =
        hex::decode(hex_str).map_err(|e| Error::Crypto(format!("Invalid signing key hex: {e}")))?;

    // Validate key length before passing to k256 (which panics on wrong length)
    if key_bytes.len() != 32 {
        return Err(Error::Crypto(format!(
            "Invalid signing key length: expected 32 bytes, got {}",
            key_bytes.len()
        )));
    }

    let signing_key = SigningKey::from_bytes(key_bytes.as_slice().into())
        .map_err(|e| Error::Crypto(format!("Invalid signing key: {e}")))?;

    // 2. Generate random nonce
    let mut nonce_bytes = [0u8; 32];
    getrandom(&mut nonce_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate random nonce: {e}")))?;
    let nonce = FieldElement::from_arbitrary_raw_bytes(&nonce_bytes);

    // 3. Get current timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| Error::Crypto(format!("System time error: {e}")))?
        .as_secs();

    // 4. Compute message to sign (72 bytes)
    let msg = compute_rp_signature_msg(nonce, action, timestamp);

    // 5. Hash with keccak256
    let mut hasher = Keccak::v256();
    let mut hash = [0u8; 32];
    hasher.update(&msg);
    hasher.finalize(&mut hash);

    // 6. Sign the hash (recoverable signature)
    let (sig, recovery_id) = signing_key
        .sign_prehash_recoverable(&hash)
        .map_err(|e| Error::Crypto(format!("Signing failed: {e}")))?;

    // 7. Construct 65-byte signature (r || s || v)
    let mut signature_bytes = [0u8; 65];
    signature_bytes[..64].copy_from_slice(&sig.to_bytes());
    signature_bytes[64] = recovery_id.to_byte() + 27; // Ethereum convention

    // 8. Format output
    let nonce_hex = nonce.to_string(); // FieldElement implements Display as 0x-prefixed hex
    let signature_hex = format!("0x{}", hex::encode(signature_bytes));

    Ok(RpSignature {
        sig: signature_hex,
        nonce: nonce_hex,
        created_at: timestamp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::Signature;
    use std::str::FromStr;

    // Valid 32-byte (64 hex chars) test key
    const TEST_KEY: &str = "abababababababababababababababababababababababababababababababab";
    const TEST_KEY_0X: &str = "0xabababababababababababababababababababababababababababababababab";

    #[test]
    fn test_compute_rp_signature_success() {
        let action = FieldElement::from(42_u64);

        let result = compute_rp_signature(TEST_KEY_0X, action).unwrap();

        // Verify all fields are present
        assert!(!result.sig.is_empty());
        assert!(!result.nonce.is_empty());
        assert!(result.created_at > 0);
    }

    #[test]
    fn test_nonce_is_valid_hex() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action).unwrap();

        assert!(result.nonce.starts_with("0x"));
        assert_eq!(result.nonce.len(), 66); // 0x + 64 hex chars
    }

    #[test]
    fn test_timestamp_is_valid_number() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action).unwrap();

        assert!(result.created_at > 1_700_000_000); // After 2023
    }

    #[test]
    fn test_signature_is_65_bytes() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action).unwrap();

        assert!(result.sig.starts_with("0x"));
        assert_eq!(result.sig.len(), 132); // 0x + 130 hex chars (65 bytes)
    }

    #[test]
    fn test_signature_v_value_is_27_or_28() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action).unwrap();
        let sig_hex = result.sig.strip_prefix("0x").unwrap();
        let sig_bytes = hex::decode(sig_hex).unwrap();

        let v = sig_bytes[64];
        assert!(v == 27 || v == 28, "v value should be 27 or 28, got {v}");
    }

    #[test]
    fn test_compute_rp_signature_msg_length() {
        let nonce = FieldElement::from(123_u64);
        let action = FieldElement::from(456_u64);
        let timestamp = 1_700_000_000_u64;

        let msg = compute_rp_signature_msg(nonce, action, timestamp);

        assert_eq!(msg.len(), 72); // 32 + 32 + 8
    }

    #[test]
    fn test_nonce_can_be_parsed_as_field_element() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action).unwrap();

        // Should parse back into a FieldElement
        let parsed_nonce = FieldElement::from_str(&result.nonce);
        assert!(
            parsed_nonce.is_ok(),
            "Failed to parse nonce: {}",
            result.nonce
        );
    }

    #[test]
    fn test_signature_can_be_parsed_as_alloy_signature() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action).unwrap();

        // Should parse into alloy_primitives::Signature
        let parsed_signature = Signature::from_str(&result.sig);
        assert!(
            parsed_signature.is_ok(),
            "Failed to parse signature: {}",
            result.sig
        );

        // Verify we can access signature components
        let sig = parsed_signature.unwrap();
        // r and s should be non-zero
        assert!(!sig.r().is_zero(), "r component should be non-zero");
        assert!(!sig.s().is_zero(), "s component should be non-zero");
    }

    #[test]
    fn test_compute_rp_signature_invalid_hex() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature("not_valid_hex", action);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), Error::Crypto(_)));
    }

    #[test]
    fn test_compute_rp_signature_wrong_key_length() {
        let action = FieldElement::from(1_u64);

        // Too short key (only 4 bytes)
        let result = compute_rp_signature("0xabababab", action);
        assert!(result.is_err());

        let err = result.unwrap_err();
        match err {
            Error::Crypto(msg) => assert!(msg.contains("Invalid signing key length")),
            _ => panic!("Expected Crypto error"),
        }
    }

    #[test]
    fn test_compute_rp_signature_accepts_key_without_prefix() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY, action);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compute_rp_signature_accepts_key_with_prefix() {
        let action = FieldElement::from(1_u64);

        let result = compute_rp_signature(TEST_KEY_0X, action);
        assert!(result.is_ok());
    }
}
