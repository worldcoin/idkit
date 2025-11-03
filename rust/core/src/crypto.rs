//! Cryptographic utilities for `IDKit`

use crate::{Error, Result};
use ruint::aliases::U256;
use tiny_keccak::{Hasher, Keccak};

// ============================================================================
// Native (non-WASM) implementation using ring
// ============================================================================

#[cfg(feature = "native-crypto")]
use ring::{
    aead::{self, LessSafeKey, Nonce, UnboundKey},
    rand::{SecureRandom, SystemRandom},
};

// Re-export ring types for use in other modules
#[cfg(feature = "native-crypto")]
pub use ring::aead::{LessSafeKey as CryptoKey, Nonce as CryptoNonce};

/// Generates a random encryption key, `LessSafeKey`, and nonce for AES-256-GCM
///
/// Returns a tuple of (key_bytes, iv_bytes, LessSafeKey, Nonce) where:
/// - key_bytes can be used for serialization (e.g., in connect URLs)
/// - iv_bytes can be used for transmission (e.g., in encrypted payloads)
/// - LessSafeKey is used for encryption/decryption
/// - Nonce is consumed by encryption
///
/// # Errors
///
/// Returns an error if the random number generator fails
#[cfg(feature = "native-crypto")]
pub fn generate_key() -> Result<(Vec<u8>, Vec<u8>, LessSafeKey, Nonce)> {
    let rng = SystemRandom::new();

    let mut iv = [0u8; aead::NONCE_LEN];
    rng.fill(&mut iv)
        .map_err(|_| Error::Crypto("Failed to generate IV".to_string()))?;

    let mut key_bytes = [0u8; 32]; // 256 bits
    rng.fill(&mut key_bytes)
        .map_err(|_| Error::Crypto("Failed to generate key".to_string()))?;

    let unbound_key = UnboundKey::new(&aead::AES_256_GCM, &key_bytes)
        .map_err(|_| Error::Crypto("AES-256-GCM is a supported algorithm".to_string()))?;

    Ok((
        key_bytes.to_vec(),
        iv.to_vec(),
        LessSafeKey::new(unbound_key),
        Nonce::assume_unique_for_key(iv),
    ))
}

/// Encrypts plaintext using AES-256-GCM with a provided key and nonce
///
/// # Errors
///
/// Returns an error if encryption fails
#[cfg(feature = "native-crypto")]
pub fn encrypt(key: &LessSafeKey, nonce: Nonce, plaintext: &[u8]) -> Result<Vec<u8>> {
    let mut ciphertext = plaintext.to_vec();
    key.seal_in_place_append_tag(nonce, aead::Aad::empty(), &mut ciphertext)
        .map_err(|_| Error::Crypto("Encryption failed".to_string()))?;

    Ok(ciphertext)
}

/// Decrypts ciphertext using AES-256-GCM with a provided key and nonce
///
/// # Errors
///
/// Returns an error if the nonce is invalid or decryption fails
#[cfg(feature = "native-crypto")]
pub fn decrypt(key: &LessSafeKey, iv: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    let nonce = Nonce::try_assume_unique_for_key(iv)
        .map_err(|_| Error::Crypto("Invalid IV length".to_string()))?;

    let mut plaintext = ciphertext.to_vec();
    let decrypted = key
        .open_in_place(nonce, aead::Aad::empty(), &mut plaintext)
        .map_err(|_| Error::Crypto("Decryption failed".to_string()))?;

    Ok(decrypted.to_vec())
}

// ============================================================================
// WASM implementation using getrandom
// ============================================================================

#[cfg(all(target_arch = "wasm32", not(feature = "native-crypto")))]
pub fn generate_key() -> Result<(Vec<u8>, Vec<u8>)> {
    use getrandom::getrandom;

    let mut key_bytes = vec![0u8; 32]; // 256 bits
    getrandom(&mut key_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate key: {}", e)))?;

    let mut iv = vec![0u8; 12]; // AES-GCM nonce length
    getrandom(&mut iv)
        .map_err(|e| Error::Crypto(format!("Failed to generate IV: {}", e)))?;

    Ok((key_bytes, iv))
}

#[cfg(all(target_arch = "wasm32", not(feature = "native-crypto")))]
pub fn encrypt(_key: &[u8], _iv: &[u8], _plaintext: &[u8]) -> Result<Vec<u8>> {
    // Note: Encryption is not used in WASM (client-side only needs to receive encrypted data)
    // If needed in the future, implement using Web Crypto API
    Err(Error::Crypto("Encryption not supported in WASM build".to_string()))
}

#[cfg(all(target_arch = "wasm32", not(feature = "native-crypto")))]
pub fn decrypt(_key: &[u8], _iv: &[u8], _ciphertext: &[u8]) -> Result<Vec<u8>> {
    // Note: Decryption is not used in WASM (client-side only needs to send encrypted data)
    // If needed in the future, implement using Web Crypto API
    Err(Error::Crypto("Decryption not supported in WASM build".to_string()))
}

// ============================================================================
// Common implementations (work on both native and WASM)
// ============================================================================

/// Hashes a value to a field element using Keccak256
///
/// The output is shifted right by 8 bits to fit within the field prime
#[must_use]
pub fn hash_to_field(input: &[u8]) -> U256 {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(input);
    hasher.finalize(&mut output);

    // Convert to U256 and shift right by 8 bits (1 byte) to fit within the field prime
    let n = U256::try_from_be_slice(&output)
        .unwrap_or_else(|| unreachable!("32 bytes fit in U256"));

    n >> 8
}

/// Encodes a signal for the World ID protocol using ABI encoding
///
/// Takes any type that implements `alloy_sol_types::SolValue` and returns the keccak256 hash
#[must_use]
pub fn encode_signal_abi<V: alloy_sol_types::SolValue>(signal: &V) -> U256 {
    hash_to_field(&signal.abi_encode_packed())
}

/// Encodes a signal for the World ID protocol from raw bytes
///
/// Takes raw bytes and returns the keccak256 hash, shifted right by 8 bits
#[must_use]
pub fn encode_signal(signal: &[u8]) -> String {
    let hash = hash_to_field(signal);
    format!("0x{:064x}", hash)
}

/// Encodes a signal from a string
#[must_use]
pub fn encode_signal_str(signal: &str) -> String {
    encode_signal(signal.as_bytes())
}

/// Encodes an action for the World ID protocol
///
/// Actions are kept as-is (no hashing)
#[must_use]
pub fn encode_action(action: &str) -> String {
    action.to_string()
}

/// Base64 encodes bytes
#[must_use]
pub fn base64_encode(input: &[u8]) -> String {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.encode(input)
}

/// Base64 decodes a string
///
/// # Errors
///
/// Returns an error if the input is not valid base64
pub fn base64_decode(input: &str) -> Result<Vec<u8>> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    Ok(STANDARD.decode(input)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_key() {
        #[cfg(feature = "native-crypto")]
        {
            use ring::aead;
            let (key_bytes, iv_bytes, _key, _nonce) = generate_key().unwrap();
            assert_eq!(key_bytes.len(), 32);
            assert_eq!(iv_bytes.len(), aead::NONCE_LEN);
        }
        #[cfg(not(feature = "native-crypto"))]
        {
            let (key, iv) = generate_key().unwrap();
            assert_eq!(key.len(), 32);
            assert_eq!(iv.len(), 12);
        }
    }

    #[cfg(feature = "native-crypto")]
    #[test]
    fn test_encrypt_decrypt() {
        let (_key_bytes, iv_bytes, key, nonce) = generate_key().unwrap();
        let plaintext = b"Hello, World!";

        let ciphertext = encrypt(&key, nonce, plaintext).unwrap();
        assert_ne!(ciphertext.as_slice(), plaintext);

        let decrypted = decrypt(&key, &iv_bytes, &ciphertext).unwrap();
        assert_eq!(decrypted.as_slice(), plaintext);
    }

    #[test]
    fn test_hash_to_field() {
        let input = b"test";
        let hash = hash_to_field(input);
        // U256 is always 256 bits (32 bytes)
        // Verify it produces consistent output
        let hash2 = hash_to_field(input);
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_encode_signal() {
        let signal = "test_signal";
        let encoded = encode_signal_str(signal);
        assert!(encoded.starts_with("0x"));
        assert_eq!(encoded.len(), 66); // 0x + 64 hex chars
    }

    #[test]
    fn test_base64_encode_decode() {
        let input = b"Hello, World!";
        let encoded = base64_encode(input);
        let decoded = base64_decode(&encoded).unwrap();
        assert_eq!(decoded.as_slice(), input);
    }
}
