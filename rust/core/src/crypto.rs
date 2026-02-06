//! Cryptographic utilities for `IDKit`

use crate::Result;
use ruint::aliases::U256;
use tiny_keccak::{Hasher, Keccak};

// ============================================================================
// AES-256-GCM encryption (unified implementation for native and WASM)
// ============================================================================
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
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
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
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
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
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
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
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

/// Cryptographic key wrapper for encryption/decryption
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
#[derive(Debug, Clone)]
pub struct CryptoKey {
    /// AES-256 key (32 bytes)
    pub key: [u8; 32],
    /// Nonce for AES-GCM (12 bytes)
    pub nonce: [u8; 12],
}

#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
impl CryptoKey {
    /// Creates a new crypto key from bytes
    #[must_use]
    pub const fn new(key: [u8; 32], nonce: [u8; 12]) -> Self {
        Self { key, nonce }
    }

    /// Generates a random crypto key
    ///
    /// # Errors
    ///
    /// Returns an error if random generation fails
    pub fn generate() -> Result<Self> {
        let (key, nonce) = generate_key()?;
        Ok(Self { key, nonce })
    }
}

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

/// Hashes a signal using ABI encoding
///
/// Takes any type that implements `alloy_sol_types::SolValue` and returns the keccak256 hash
#[must_use]
pub fn hash_signal_abi<V: alloy_sol_types::SolValue>(signal: &V) -> U256 {
    hash_to_field(&signal.abi_encode_packed())
}

/// Hashes a signal using keccak256 hash
///
/// Takes a `Signal` (either string or bytes) and returns the keccak256 hash,
/// shifted right by 8 bits, formatted as a hex string with 0x prefix
#[must_use]
pub fn hash_signal(signal: &crate::Signal) -> String {
    let hash = hash_to_field(signal.as_bytes());
    format!("{hash:#066x}")
}

/// Base64 encodes bytes
#[must_use]
pub fn base64_encode(input: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(input)
}

// ============================================================================
// FFI exports for hashing utilities (Kotlin/Swift)
// ============================================================================

/// Hashes input bytes using Keccak256, shifted right 8 bits to fit within the field prime.
///
/// Returns raw bytes (32 bytes).
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // uniffi requires owned types
pub fn hash_to_field_ffi(input: Vec<u8>) -> Vec<u8> {
    hash_to_field(&input).to_be_bytes_vec()
}

/// Hashes a Signal to a signal hash (0x-prefixed hex string).
///
/// This is the same encoding used internally when constructing proof requests.
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // uniffi requires Arc for objects
pub fn hash_signal_ffi(signal: std::sync::Arc<crate::Signal>) -> String {
    hash_signal(&signal)
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
    fn test_hash_signal() {
        use crate::Signal;

        // Test string signal
        let signal = Signal::from_string("test_signal");
        let hashed = hash_signal(&signal);
        assert!(hashed.starts_with("0x"));
        assert_eq!(hashed.len(), 66); // 0x + 64 hex chars

        // Test bytes signal
        let bytes_signal = Signal::from_bytes(vec![0x01, 0x02, 0x03]);
        let hashed_bytes = hash_signal(&bytes_signal);
        assert!(hashed_bytes.starts_with("0x"));
        assert_eq!(hashed_bytes.len(), 66);
    }

    #[test]
    fn test_base64_encode_decode() {
        let input = b"Hello, World!";
        let encoded = base64_encode(input);
        let decoded = base64_decode(&encoded).unwrap();
        assert_eq!(decoded.as_slice(), input);
    }

    // Known value that was used in previous idkit versions to verify consistency of the hash_to_field implementation
    #[test]
    fn test_hash_to_field_empty_string() {
        let hash = hash_to_field(b"");
        let hex = format!("{hash:#066x}");
        assert_eq!(
            hex,
            "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4"
        );
    }
}
