//! WASM bindings for IDKit
//!
//! This crate provides WebAssembly bindings for the core IDKit library,
//! allowing it to be used in browser environments.
//!
//! Note: This WASM build provides type definitions and constraint evaluation.
//! Network operations (Session, Bridge) are handled by JavaScript fetch API.

use idkit_core::{
    AppId, Constraints, ConstraintNode, Credential, Request,
};
use wasm_bindgen::prelude::*;
use std::collections::HashSet;

#[wasm_bindgen]
pub struct WasmAppId(AppId);

#[wasm_bindgen]
impl WasmAppId {
    #[wasm_bindgen(constructor)]
    pub fn new(app_id: String) -> Result<WasmAppId, JsValue> {
        AppId::new(app_id)
            .map(WasmAppId)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(getter)]
    pub fn is_staging(&self) -> bool {
        self.0.is_staging()
    }

    #[wasm_bindgen(js_name = asString)]
    pub fn as_string(&self) -> String {
        self.0.as_str().to_string()
    }
}

#[wasm_bindgen]
pub struct WasmRequest(Request);

#[wasm_bindgen]
impl WasmRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(credential_type: JsValue, signal: String) -> Result<WasmRequest, JsValue> {
        let cred: Credential = serde_wasm_bindgen::from_value(credential_type)?;
        Ok(WasmRequest(Request::new(cred, signal)))
    }

    #[wasm_bindgen(js_name = withFaceAuth)]
    pub fn with_face_auth(self, face_auth: bool) -> WasmRequest {
        WasmRequest(self.0.with_face_auth(face_auth))
    }

    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen]
pub struct WasmConstraints(Constraints);

#[wasm_bindgen]
impl WasmConstraints {
    #[wasm_bindgen(constructor)]
    pub fn new(root: JsValue) -> Result<WasmConstraints, JsValue> {
        let node: ConstraintNode = serde_wasm_bindgen::from_value(root)?;
        Ok(WasmConstraints(Constraints::new(node)))
    }

    #[wasm_bindgen]
    pub fn evaluate(&self, available: JsValue) -> Result<bool, JsValue> {
        let creds: Vec<Credential> = serde_wasm_bindgen::from_value(available)?;
        let available_set: HashSet<Credential> = creds.into_iter().collect();
        Ok(self.0.evaluate(&available_set))
    }

    #[wasm_bindgen(js_name = firstSatisfying)]
    pub fn first_satisfying(&self, available: JsValue) -> Result<JsValue, JsValue> {
        let creds: Vec<Credential> = serde_wasm_bindgen::from_value(available)?;
        let available_set: HashSet<Credential> = creds.into_iter().collect();
        match self.0.first_satisfying(&available_set) {
            Some(cred) => serde_wasm_bindgen::to_value(&cred)
                .map_err(|e| JsValue::from_str(&e.to_string())),
            None => Ok(JsValue::NULL),
        }
    }
}

// Crypto utilities
#[wasm_bindgen(js_name = encodeSignal)]
pub fn encode_signal(signal: String) -> String {
    idkit_core::crypto::encode_signal_str(&signal)
}

#[wasm_bindgen(js_name = hashToField)]
pub fn hash_to_field(input: &[u8]) -> Vec<u8> {
    let hash = idkit_core::crypto::hash_to_field(input);
    hash.to_be_bytes_vec()
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

// Export verification level enum
#[wasm_bindgen(typescript_custom_section)]
const TS_VERIFICATION_LEVEL: &'static str = r#"
export enum VerificationLevel {
    Orb = "orb",
    Face = "face",
    Device = "device",
    Document = "document",
    SecureDocument = "secure_document"
}
"#;

// Export constraint node type
#[wasm_bindgen(typescript_custom_section)]
const TS_CONSTRAINT_NODE: &'static str = r#"
export type ConstraintNode =
    | Credential
    | { any: ConstraintNode[] }
    | { all: ConstraintNode[] };
"#;
