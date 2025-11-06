//! WASM bindings for `IDKit`
//!
//! This crate provides WebAssembly bindings for the core `IDKit` library,
//! allowing it to be used in browser environments.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

use idkit_core::{crypto, CredentialType, Signal};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Request(idkit_core::Request);

#[wasm_bindgen]
impl Request {
    /// Creates a new request
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type cannot be deserialized
    ///
    /// # Arguments
    /// * `credential_type` - The type of credential to request
    /// * `signal` - Optional signal string. Pass `null` or `undefined` for no signal.
    #[wasm_bindgen(constructor)]
    pub fn new(credential_type: JsValue, signal: Option<String>) -> Result<Self, JsValue> {
        let cred: CredentialType = serde_wasm_bindgen::from_value(credential_type)?;
        let signal_opt = signal.map(Signal::from_string);
        Ok(Self(idkit_core::Request::new(cred, signal_opt)))
    }

    /// Creates a new request with ABI-encoded bytes for the signal
    ///
    /// This is useful for on-chain use cases where RPs need ABI-encoded signals
    /// according to Solidity encoding rules.
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type cannot be deserialized
    #[wasm_bindgen(js_name = withBytes)]
    pub fn with_bytes(credential_type: JsValue, signal_bytes: &[u8]) -> Result<Self, JsValue> {
        let cred: CredentialType = serde_wasm_bindgen::from_value(credential_type)?;
        Ok(Self(idkit_core::Request::new(cred, Some(Signal::from_abi_encoded(signal_bytes)))))
    }

    /// Gets the signal as raw bytes
    #[must_use]
    #[wasm_bindgen(js_name = getSignalBytes)]
    pub fn get_signal_bytes(&self) -> Option<Vec<u8>> {
        self.0.signal_bytes()
    }

    /// Converts the request to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen]
pub struct Proof(idkit_core::Proof);

#[wasm_bindgen]
impl Proof {
    /// Creates a new proof
    ///
    /// # Errors
    ///
    /// Returns an error if the verification level cannot be deserialized
    #[wasm_bindgen(constructor)]
    pub fn new(
        proof: String,
        merkle_root: String,
        nullifier_hash: String,
        verification_level: JsValue,
    ) -> Result<Self, JsValue> {
        let cred: CredentialType = serde_wasm_bindgen::from_value(verification_level)?;
        Ok(Self(idkit_core::Proof {
            proof,
            merkle_root,
            nullifier_hash,
            verification_level: cred,
        }))
    }

    /// Converts the proof to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

// ============================================================================
// Bridge Encryption
// ============================================================================

/// Cryptographic utilities for bridge communication
///
/// This struct handles AES-256-GCM encryption/decryption for the IDKit bridge protocol.
/// It ensures cross-platform consistency by using the same encryption implementation
/// as native Swift/Kotlin bindings.
#[wasm_bindgen]
pub struct BridgeEncryption {
    key: Vec<u8>,
    nonce: Vec<u8>,
}

#[wasm_bindgen]
impl BridgeEncryption {
    /// Generates a new encryption key and nonce for bridge communication
    ///
    /// Uses cryptographically secure random number generation with:
    /// - 32-byte (256-bit) AES-GCM key
    /// - 12-byte nonce (standard for AES-GCM)
    ///
    /// # Errors
    ///
    /// Returns an error if the random number generator fails
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<BridgeEncryption, JsValue> {
        let (key, nonce) = crypto::generate_key()
            .map_err(|e| JsValue::from_str(&format!("Failed to generate key: {e}")))?;

        Ok(Self {
            key: key.to_vec(),
            nonce: nonce.to_vec(),
        })
    }

    /// Encrypts a plaintext string using AES-256-GCM
    ///
    /// # Arguments
    /// * `plaintext` - The string to encrypt
    ///
    /// # Returns
    /// Base64-encoded ciphertext
    ///
    /// # Errors
    ///
    /// Returns an error if encryption fails
    pub fn encrypt(&self, plaintext: &str) -> Result<String, JsValue> {
        let ciphertext = crypto::encrypt(&self.key, &self.nonce, plaintext.as_bytes())
            .map_err(|e| JsValue::from_str(&format!("Encryption failed: {e}")))?;

        Ok(crypto::base64_encode(&ciphertext))
    }

    /// Decrypts a base64-encoded ciphertext using AES-256-GCM
    ///
    /// # Arguments
    /// * `ciphertext_base64` - Base64-encoded ciphertext
    ///
    /// # Returns
    /// Decrypted plaintext string
    ///
    /// # Errors
    ///
    /// Returns an error if decryption or base64 decoding fails
    pub fn decrypt(&self, ciphertext_base64: &str) -> Result<String, JsValue> {
        let ciphertext = crypto::base64_decode(ciphertext_base64)
            .map_err(|e| JsValue::from_str(&format!("Base64 decode failed: {e}")))?;

        let plaintext_bytes = crypto::decrypt(&self.key, &self.nonce, &ciphertext)
            .map_err(|e| JsValue::from_str(&format!("Decryption failed: {e}")))?;

        String::from_utf8(plaintext_bytes)
            .map_err(|e| JsValue::from_str(&format!("UTF-8 decode failed: {e}")))
    }

    /// Returns the encryption key as a base64-encoded string
    ///
    /// This is used in the World App connect URL to allow the app to decrypt responses
    #[wasm_bindgen(js_name = keyBase64)]
    pub fn key_base64(&self) -> String {
        crypto::base64_encode(&self.key)
    }

    /// Returns the nonce/IV as a base64-encoded string
    ///
    /// This is sent alongside the encrypted payload in bridge requests
    #[wasm_bindgen(js_name = nonceBase64)]
    pub fn nonce_base64(&self) -> String {
        crypto::base64_encode(&self.nonce)
    }

    /// Creates a BridgeEncryption instance from existing key and nonce
    ///
    /// Useful for reconstructing encryption context from stored values
    ///
    /// # Arguments
    /// * `key_base64` - Base64-encoded 32-byte key
    /// * `nonce_base64` - Base64-encoded 12-byte nonce
    ///
    /// # Errors
    ///
    /// Returns an error if base64 decoding fails or sizes are incorrect
    #[wasm_bindgen(js_name = fromBase64)]
    pub fn from_base64(key_base64: &str, nonce_base64: &str) -> Result<BridgeEncryption, JsValue> {
        let key = crypto::base64_decode(key_base64)
            .map_err(|e| JsValue::from_str(&format!("Key decode failed: {e}")))?;
        let nonce = crypto::base64_decode(nonce_base64)
            .map_err(|e| JsValue::from_str(&format!("Nonce decode failed: {e}")))?;

        if key.len() != 32 {
            return Err(JsValue::from_str("Key must be 32 bytes"));
        }
        if nonce.len() != 12 {
            return Err(JsValue::from_str("Nonce must be 12 bytes"));
        }

        Ok(Self { key, nonce })
    }
}

// ============================================================================
// Crypto Utilities
// ============================================================================

/// Hashes a signal to a field element using Keccak256
///
/// This produces a hex-encoded hash (with 0x prefix) that's compatible with
/// Ethereum and other EVM-compatible chains. The hash is shifted right by 8 bits
/// to fit within the field prime used in zero-knowledge proofs.
///
/// # Arguments
/// * `signal` - The signal string to hash
///
/// # Returns
/// Hex-encoded hash string (66 characters, includes 0x prefix)
#[wasm_bindgen(js_name = hashSignal)]
pub fn hash_signal(signal: &str) -> String {
    let signal_obj = Signal::from_string(signal);
    crypto::encode_signal(&signal_obj)
}

/// Base64 encodes bytes
///
/// # Arguments
/// * `data` - The bytes to encode
///
/// # Returns
/// Base64-encoded string
#[wasm_bindgen(js_name = base64Encode)]
pub fn base64_encode(data: &[u8]) -> String {
    crypto::base64_encode(data)
}

/// Base64 decodes a string
///
/// # Arguments
/// * `input` - Base64-encoded string
///
/// # Returns
/// Decoded bytes
///
/// # Errors
///
/// Returns an error if the input is not valid base64
#[wasm_bindgen(js_name = base64Decode)]
pub fn base64_decode(input: &str) -> Result<Vec<u8>, JsValue> {
    crypto::base64_decode(input)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode failed: {e}")))
}

// Export credential enum
#[wasm_bindgen(typescript_custom_section)]
const TS_CREDENTIAL: &str = r#"
export enum Credential {
    Orb = "orb",
    Face = "face",
    SecureDocument = "secure_document",
    Document = "document",
    Device = "device"
}
"#;
