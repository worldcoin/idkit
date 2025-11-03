//! WASM bindings for IDKit
//!
//! This crate provides WebAssembly bindings for the core IDKit library,
//! allowing it to be used in browser environments.
//!
//! Phase 1: Basic types and serialization only.

use idkit_core::{Credential, Proof, Request};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmRequest(Request);

#[wasm_bindgen]
impl WasmRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(credential_type: JsValue, signal: String) -> Result<WasmRequest, JsValue> {
        let cred: Credential = serde_wasm_bindgen::from_value(credential_type)?;
        Ok(WasmRequest(Request {
            credential_type: cred,
            signal,
            face_auth: None,
        }))
    }

    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen]
pub struct WasmProof(Proof);

#[wasm_bindgen]
impl WasmProof {
    #[wasm_bindgen(constructor)]
    pub fn new(
        proof: String,
        merkle_root: String,
        nullifier_hash: String,
        verification_level: JsValue,
    ) -> Result<WasmProof, JsValue> {
        let cred: Credential = serde_wasm_bindgen::from_value(verification_level)?;
        Ok(WasmProof(Proof {
            proof,
            merkle_root,
            nullifier_hash,
            verification_level: cred,
        }))
    }

    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

// Export credential enum
#[wasm_bindgen(typescript_custom_section)]
const TS_CREDENTIAL: &'static str = r#"
export enum Credential {
    Orb = "orb",
    Face = "face",
    SecureDocument = "secure_document",
    Document = "document",
    Device = "device"
}
"#;
