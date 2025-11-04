//! WASM bindings for `IDKit`
//!
//! This crate provides WebAssembly bindings for the core `IDKit` library,
//! allowing it to be used in browser environments.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

use idkit_core::{Credential, Proof, Request};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmRequest(Request);

#[wasm_bindgen]
impl WasmRequest {
    /// Creates a new WASM request wrapper
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
            Some(signal)
        };
        Ok(Self(Request {
            credential_type: cred,
            signal: signal_opt,
            face_auth: None,
        }))
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
pub struct WasmProof(Proof);

#[wasm_bindgen]
impl WasmProof {
    /// Creates a new WASM proof wrapper
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
        Ok(Self(Proof {
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
