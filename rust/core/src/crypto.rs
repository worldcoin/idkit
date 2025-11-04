//! Cryptographic utilities for `IDKit`

use crate::{Error, Result};
use ruint::aliases::U256;
use tiny_keccak::{Hasher, Keccak};

// ============================================================================
// Native (non-WASM) implementation using RustCrypto
// ============================================================================

#[cfg(feature = "native-crypto")]
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

/// Generates a random encryption key and nonce for AES-256-GCM
///
/// Returns a tuple of (`key_bytes`, `nonce_bytes`) where both can be used
/// for serialization and transmission
///
/// # Errors
///
/// Returns an error if the random number generator fails
#[cfg(feature = "native-crypto")]
pub fn generate_key() -> Result<(Vec<u8>, Vec<u8>)> {
    use getrandom::getrandom;

    let mut key_bytes = vec![0u8; 32]; // 256 bits
    getrandom(&mut key_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate key: {e}")))?;

    let mut nonce_bytes = vec![0u8; 12]; // AES-GCM standard nonce length
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
#[allow(deprecated)] // aes-gcm uses old generic-array version
pub fn encrypt(key: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    let nonce_array = Nonce::clone_from_slice(nonce);

    cipher
        .encrypt(&nonce_array, plaintext)
        .map_err(|_| Error::Crypto("Encryption failed".to_string()))
}

/// Decrypts ciphertext using AES-256-GCM
///
/// # Errors
///
/// Returns an error if the nonce is invalid or decryption fails
#[cfg(feature = "native-crypto")]
#[allow(deprecated)] // aes-gcm uses old generic-array version
pub fn decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    let nonce_array = Nonce::clone_from_slice(nonce);

    cipher
        .decrypt(&nonce_array, ciphertext)
        .map_err(|_| Error::Crypto("Decryption failed".to_string()))
}

// ============================================================================
// WASM implementation using getrandom
// ============================================================================

#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
pub fn generate_key() -> Result<(Vec<u8>, Vec<u8>)> {
    use getrandom::getrandom;

    let mut key_bytes = vec![0u8; 32]; // 256 bits
    getrandom(&mut key_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate key: {e}")))?;

    let mut iv = vec![0u8; 12]; // AES-GCM nonce length
    getrandom(&mut iv)
        .map_err(|e| Error::Crypto(format!("Failed to generate IV: {e}")))?;

    Ok((key_bytes, iv))
}

/// Encrypts plaintext using AES-256-GCM via Web Crypto API
///
/// # Errors
///
/// Returns an error if encryption fails or Web Crypto API is not available
#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
pub async fn encrypt(key: &[u8], iv: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    use js_sys::{Object, Reflect, Uint8Array};
    use wasm_bindgen::JsValue;
    use wasm_bindgen_futures::JsFuture;
    use web_sys::window;

    let window = window().ok_or_else(|| Error::Crypto("Window not available".to_string()))?;
    let crypto = window
        .crypto()
        .map_err(|_| Error::Crypto("Crypto API not available".to_string()))?;
    let subtle = crypto.subtle();

    // Import key
    let key_array = Uint8Array::from(key);
    let key_obj = Object::new();
    Reflect::set(&key_obj, &"name".into(), &"AES-GCM".into())
        .map_err(|_| Error::Crypto("Failed to create key object".to_string()))?;

    let crypto_key = JsFuture::from(
        subtle
            .import_key_with_object("raw", &key_array, &key_obj, false, &js_sys::Array::of1(&"encrypt".into()))
            .map_err(|_| Error::Crypto("Failed to import key".to_string()))?,
    )
    .await
    .map_err(|_| Error::Crypto("Failed to import key".to_string()))?;

    // Encrypt
    let algorithm = Object::new();
    Reflect::set(&algorithm, &"name".into(), &"AES-GCM".into())
        .map_err(|_| Error::Crypto("Failed to create algorithm object".to_string()))?;
    Reflect::set(&algorithm, &"iv".into(), &Uint8Array::from(iv))
        .map_err(|_| Error::Crypto("Failed to set IV".to_string()))?;

    let plaintext_array = Uint8Array::from(plaintext);
    let encrypted = JsFuture::from(
        subtle
            .encrypt_with_object_and_u8_array(&algorithm, &crypto_key.into(), plaintext)
            .map_err(|_| Error::Crypto("Encryption failed".to_string()))?,
    )
    .await
    .map_err(|_| Error::Crypto("Encryption failed".to_string()))?;

    let result = Uint8Array::new(&encrypted);
    Ok(result.to_vec())
}

/// Decrypts ciphertext using AES-256-GCM via Web Crypto API
///
/// # Errors
///
/// Returns an error if decryption fails or Web Crypto API is not available
#[cfg(all(target_arch = "wasm32", feature = "wasm-crypto"))]
pub async fn decrypt(key: &[u8], iv: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    use js_sys::{Object, Reflect, Uint8Array};
    use wasm_bindgen::JsValue;
    use wasm_bindgen_futures::JsFuture;
    use web_sys::window;

    let window = window().ok_or_else(|| Error::Crypto("Window not available".to_string()))?;
    let crypto = window
        .crypto()
        .map_err(|_| Error::Crypto("Crypto API not available".to_string()))?;
    let subtle = crypto.subtle();

    // Import key
    let key_array = Uint8Array::from(key);
    let key_obj = Object::new();
    Reflect::set(&key_obj, &"name".into(), &"AES-GCM".into())
        .map_err(|_| Error::Crypto("Failed to create key object".to_string()))?;

    let crypto_key = JsFuture::from(
        subtle
            .import_key_with_object("raw", &key_array, &key_obj, false, &js_sys::Array::of1(&"decrypt".into()))
            .map_err(|_| Error::Crypto("Failed to import key".to_string()))?,
    )
    .await
    .map_err(|_| Error::Crypto("Failed to import key".to_string()))?;

    // Decrypt
    let algorithm = Object::new();
    Reflect::set(&algorithm, &"name".into(), &"AES-GCM".into())
        .map_err(|_| Error::Crypto("Failed to create algorithm object".to_string()))?;
    Reflect::set(&algorithm, &"iv".into(), &Uint8Array::from(iv))
        .map_err(|_| Error::Crypto("Failed to set IV".to_string()))?;

    let ciphertext_array = Uint8Array::from(ciphertext);
    let decrypted = JsFuture::from(
        subtle
            .decrypt_with_object_and_u8_array(&algorithm, &crypto_key.into(), ciphertext)
            .map_err(|_| Error::Crypto("Decryption failed".to_string()))?,
    )
    .await
    .map_err(|_| Error::Crypto("Decryption failed".to_string()))?;

    let result = Uint8Array::new(&decrypted);
    Ok(result.to_vec())
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
    format!("0x{hash:064x}")
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
