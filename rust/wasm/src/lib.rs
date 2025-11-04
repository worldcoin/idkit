//! WASM bindings for `IDKit`
//!
//! This crate provides WebAssembly bindings for the core `IDKit` library,
//! allowing it to be used in browser environments.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

use idkit_core::{Credential, Signal};
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
    #[wasm_bindgen(constructor)]
    pub fn new(credential_type: JsValue, signal: String) -> Result<Self, JsValue> {
        let cred: Credential = serde_wasm_bindgen::from_value(credential_type)?;
        let signal_opt = if signal.is_empty() {
            None
        } else {
            Some(Signal::from_string(signal))
        };
        Ok(Self(idkit_core::Request {
            credential_type: cred,
            signal: signal_opt,
            face_auth: None,
        }))
    }

    /// Creates a new request with arbitrary bytes for the signal
    ///
    /// This is useful for on-chain use cases where RPs need custom-encoded signals.
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type cannot be deserialized
    #[wasm_bindgen(js_name = withBytes)]
    pub fn with_bytes(credential_type: JsValue, signal_bytes: &[u8]) -> Result<Self, JsValue> {
        let cred: Credential = serde_wasm_bindgen::from_value(credential_type)?;
        Ok(Self(idkit_core::Request::with_signal_bytes(cred, signal_bytes)))
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
        let cred: Credential = serde_wasm_bindgen::from_value(verification_level)?;
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
