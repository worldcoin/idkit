//! WASM bindings for IDKit
//!
//! This crate provides WebAssembly bindings for the core IDKit library,
//! allowing it to be used in browser environments.

use idkit_core::session::SessionConfig;
use idkit_core::{
    AppId, Constraints, Credential, Proof, Request, Session, SessionConfig, VerificationLevel,
};
use wasm_bindgen::prelude::*;

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
}

#[wasm_bindgen]
pub struct WasmSessionConfig(SessionConfig);

#[wasm_bindgen]
impl WasmSessionConfig {
    #[wasm_bindgen(constructor)]
    pub fn new(app_id: &WasmAppId, action: String) -> WasmSessionConfig {
        WasmSessionConfig(SessionConfig::new(app_id.0.clone(), action))
    }

    #[wasm_bindgen(js_name = fromVerificationLevel)]
    pub fn from_verification_level(
        app_id: &WasmAppId,
        action: String,
        verification_level: JsValue,
        signal: String,
    ) -> Result<WasmSessionConfig, JsValue> {
        let vl: VerificationLevel = serde_wasm_bindgen::from_value(verification_level)?;
        Ok(WasmSessionConfig(SessionConfig::from_verification_level(
            app_id.0.clone(),
            action,
            vl,
            signal,
        )))
    }

    #[wasm_bindgen(js_name = withRequest)]
    pub fn with_request(self, request: &WasmRequest) -> WasmSessionConfig {
        WasmSessionConfig(self.0.with_request(request.0.clone()))
    }
}

#[wasm_bindgen]
pub struct WasmSession(Session);

#[wasm_bindgen]
impl WasmSession {
    #[wasm_bindgen(constructor)]
    pub async fn new(config: WasmSessionConfig) -> Result<WasmSession, JsValue> {
        Session::create(config.0)
            .await
            .map(WasmSession)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = connectUrl)]
    pub fn connect_url(&self) -> String {
        self.0.connect_url()
    }

    #[wasm_bindgen]
    pub async fn poll(&self) -> Result<JsValue, JsValue> {
        self.0
            .poll()
            .await
            .map(|status| serde_wasm_bindgen::to_value(&status).unwrap())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = waitForProof)]
    pub async fn wait_for_proof(&self) -> Result<JsValue, JsValue> {
        self.0
            .wait_for_proof()
            .await
            .map(|proof| serde_wasm_bindgen::to_value(&proof).unwrap())
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

// Export verification level enum
#[wasm_bindgen(typescript_custom_section)]
const TS_VERIFICATION_LEVEL: &'static str = r#"
export enum VerificationLevel {
    Orb = "orb",
    Device = "device",
    Document = "document",
    SecureDocument = "secure_document"
}
"#;
