//! Cryptographic utilities for `IDKit`

use crate::Result;
use ruint::aliases::U256;
use tiny_keccak::{Hasher, Keccak};

// ============================================================================
// Native (non-WASM) implementation using RustCrypto
// ============================================================================

#[cfg(feature = "native-crypto")]
use {
    aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    },
    getrandom::getrandom,
};

/// Generates a random encryption key and nonce for AES-256-GCM
///
/// Returns a tuple of (`key_bytes`, `nonce_bytes`) as fixed-size arrays
///
/// # Errors
///
/// Returns an error if the random number generator fails
#[cfg(feature = "native-crypto")]
pub fn generate_key() -> Result<([u8; 32], [u8; 12])> {
    use crate::Error;

    let mut key_bytes = [0u8; 32]; // 256 bits
    getrandom(&mut key_bytes).map_err(|e| Error::Crypto(format!("Failed to generate key: {e}")))?;

    let mut nonce_bytes = [0u8; 12]; // AES-GCM standard nonce length
    getrandom(&mut nonce_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate nonce: {e}")))?;

    Ok((key_bytes, nonce_bytes))
}

/// Encrypts plaintext using AES-256-GCM
///
/// # Errors
///
/// Returns an error if encryption fails
#[cfg(feature = "native-crypto")]
pub fn encrypt(key: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    use crate::Error;

    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    // Convert slice to array and then to GenericArray
    let nonce_array: [u8; 12] = nonce
        .try_into()
        .map_err(|_| Error::Crypto("Nonce must be exactly 12 bytes".to_string()))?;
    let nonce_ref = Nonce::from(nonce_array);

    cipher
        .encrypt(&nonce_ref, plaintext)
        .map_err(|_| Error::Crypto("Encryption failed".to_string()))
}

/// Decrypts ciphertext using AES-256-GCM
///
/// # Errors
///
/// Returns an error if the nonce is invalid or decryption fails
#[cfg(feature = "native-crypto")]
pub fn decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    use crate::Error;

    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    // Convert slice to array and then to GenericArray
    let nonce_array: [u8; 12] = nonce
        .try_into()
        .map_err(|_| Error::Crypto("Nonce must be exactly 12 bytes".to_string()))?;
    let nonce_ref = Nonce::from(nonce_array);

    cipher
        .decrypt(&nonce_ref, ciphertext)
        .map_err(|_| Error::Crypto("Decryption failed".to_string()))
}

// ============================================================================
// WASM implementation using RustCrypto (pure Rust, same as native)
// ============================================================================

#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
use {
    aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    },
    getrandom::getrandom,
};

#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
pub fn generate_key() -> Result<([u8; 32], [u8; 12])> {
    use crate::Error;

    let mut key_bytes = [0u8; 32]; // 256 bits
    getrandom(&mut key_bytes).map_err(|e| Error::Crypto(format!("Failed to generate key: {e}")))?;

    let mut nonce_bytes = [0u8; 12]; // AES-GCM nonce length
    getrandom(&mut nonce_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate nonce: {e}")))?;

    Ok((key_bytes, nonce_bytes))
}

/// Encrypts plaintext using AES-256-GCM (pure Rust implementation)
///
/// # Errors
///
/// Returns an error if encryption fails
#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
pub fn encrypt(key: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    use crate::Error;

    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    // Convert slice to array and then to GenericArray
    let nonce_array: [u8; 12] = nonce
        .try_into()
        .map_err(|_| Error::Crypto("Nonce must be exactly 12 bytes".to_string()))?;
    let nonce_ref = Nonce::from(nonce_array);

    cipher
        .encrypt(&nonce_ref, plaintext)
        .map_err(|_| Error::Crypto("Encryption failed".to_string()))
}

/// Decrypts ciphertext using AES-256-GCM (pure Rust implementation)
///
/// # Errors
///
/// Returns an error if the nonce is invalid or decryption fails
#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
pub fn decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    use crate::Error;

    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    // Convert slice to array and then to GenericArray
    let nonce_array: [u8; 12] = nonce
        .try_into()
        .map_err(|_| Error::Crypto("Nonce must be exactly 12 bytes".to_string()))?;
    let nonce_ref = Nonce::from(nonce_array);

    cipher
        .decrypt(&nonce_ref, ciphertext)
        .map_err(|_| Error::Crypto("Decryption failed".to_string()))
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
    let n =
        U256::try_from_be_slice(&output).unwrap_or_else(|| unreachable!("32 bytes fit in U256"));

    n >> 8
}

/// Encodes a signal using ABI encoding
///
/// Takes any type that implements `alloy_sol_types::SolValue` and returns the keccak256 hash
#[must_use]
pub fn encode_signal_abi<V: alloy_sol_types::SolValue>(signal: &V) -> U256 {
    hash_to_field(&signal.abi_encode_packed())
}

/// Encodes a signal from raw bytes
///
/// Takes raw bytes and returns the keccak256 hash, shifted right by 8 bits
#[must_use]
pub fn encode_signal(signal: &[u8]) -> String {
    let hash = hash_to_field(signal);
    format!("{hash:#066x}")
}

/// Encodes a signal from a string
#[must_use]
pub fn encode_signal_str(signal: &str) -> String {
    encode_signal(signal.as_bytes())
}

/// Encodes an action
#[must_use]
pub fn encode_action(action: &str) -> String {
    action.to_string()
}

/// Base64 encodes bytes
#[must_use]
pub fn base64_encode(input: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(input)
}

/// Base64 decodes a string
///
/// # Errors
///
/// Returns an error if the input is not valid base64
pub fn base64_decode(input: &str) -> Result<Vec<u8>> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(STANDARD.decode(input)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(feature = "native-crypto")]
    fn test_generate_key_native() {
        let (key_bytes, nonce_bytes) = generate_key().unwrap();
        assert_eq!(key_bytes.len(), 32);
        assert_eq!(nonce_bytes.len(), 12);
    }

    #[test]
    #[cfg(all(feature = "wasm-crypto", not(feature = "native-crypto")))]
    fn test_generate_key_wasm() {
        let (key, nonce) = generate_key().unwrap();
        assert_eq!(key.len(), 32);
        assert_eq!(nonce.len(), 12);
    }

    #[cfg(feature = "native-crypto")]
    #[test]
    fn test_encrypt_decrypt() {
        let (key_bytes, nonce_bytes) = generate_key().unwrap();
        let plaintext = b"Hello, World!";

        let ciphertext = encrypt(&key_bytes, &nonce_bytes, plaintext).unwrap();
        assert_ne!(ciphertext.as_slice(), plaintext);

        let decrypted = decrypt(&key_bytes, &nonce_bytes, &ciphertext).unwrap();
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
