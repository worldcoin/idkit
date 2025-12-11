//! WASM bindings for `IDKit`
//!
//! This module provides WebAssembly bindings for the core `IDKit` library,
//! allowing it to be used in browser environments.

#![allow(clippy::needless_pass_by_value)]
#![allow(clippy::missing_panics_doc)]

use crate::{CredentialType, Signal, VerificationLevel};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

#[wasm_bindgen]
pub struct IDKitRequest(crate::Request);

#[wasm_bindgen]
impl IDKitRequest {
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
        Ok(Self(crate::Request::new(cred, signal_opt)))
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
        Ok(Self(crate::Request::new(
            cred,
            Some(Signal::from_abi_encoded(signal_bytes)),
        )))
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
pub struct IDKitProof(crate::Proof);

#[wasm_bindgen]
impl IDKitProof {
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
        Ok(Self(crate::Proof {
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

/// Bridge encryption for secure communication between client and bridge
#[wasm_bindgen]
pub struct BridgeEncryption {
    key: Vec<u8>,
    nonce: Vec<u8>,
}

#[wasm_bindgen]
impl BridgeEncryption {
    /// Creates a new `BridgeEncryption` instance with randomly generated key and nonce
    ///
    /// # Errors
    ///
    /// Returns an error if key generation fails
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<Self, JsValue> {
        let (key, nonce) = crate::crypto::generate_key()
            .map_err(|e| JsValue::from_str(&format!("Failed to generate key: {e}")))?;
        Ok(Self {
            key: key.to_vec(),
            nonce: nonce.to_vec(),
        })
    }

    /// Encrypts a plaintext string using AES-256-GCM and returns base64
    ///
    /// # Errors
    ///
    /// Returns an error if encryption fails
    pub fn encrypt(&self, plaintext: &str) -> Result<String, JsValue> {
        let ciphertext = crate::crypto::encrypt(&self.key, &self.nonce, plaintext.as_bytes())
            .map_err(|e| JsValue::from_str(&format!("Encryption failed: {e}")))?;
        Ok(crate::crypto::base64_encode(&ciphertext))
    }

    /// Decrypts a base64-encoded ciphertext using AES-256-GCM
    ///
    /// # Errors
    ///
    /// Returns an error if decryption fails or the output is not valid UTF-8
    pub fn decrypt(&self, ciphertext_base64: &str) -> Result<String, JsValue> {
        let ciphertext = crate::crypto::base64_decode(ciphertext_base64)
            .map_err(|e| JsValue::from_str(&format!("Base64 decode failed: {e}")))?;

        let plaintext_bytes = crate::crypto::decrypt(&self.key, &self.nonce, &ciphertext)
            .map_err(|e| JsValue::from_str(&format!("Decryption failed: {e}")))?;

        String::from_utf8(plaintext_bytes)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8: {e}")))
    }

    /// Returns the key as a base64-encoded string
    #[must_use]
    #[wasm_bindgen(js_name = keyBase64)]
    pub fn key_base64(&self) -> String {
        crate::crypto::base64_encode(&self.key)
    }

    /// Returns the nonce as a base64-encoded string
    #[must_use]
    #[wasm_bindgen(js_name = nonceBase64)]
    pub fn nonce_base64(&self) -> String {
        crate::crypto::base64_encode(&self.nonce)
    }
}

/// Hashes a signal string using Keccak256
#[must_use]
#[wasm_bindgen(js_name = hashSignal)]
pub fn hash_signal(signal: &str) -> String {
    use crate::crypto::hash_to_field;
    let hash = hash_to_field(signal.as_bytes());
    format!("{hash:#066x}")
}

/// Hashes raw bytes using Keccak256
#[must_use]
#[wasm_bindgen(js_name = hashSignalBytes)]
pub fn hash_signal_bytes(bytes: &[u8]) -> String {
    use crate::crypto::hash_to_field;
    let hash = hash_to_field(bytes);
    format!("{hash:#066x}")
}

/// Request DTO for JS interop
#[derive(serde::Deserialize)]
struct JsRequestDto {
    credential_type: CredentialType,
    #[serde(default)]
    signal: Option<String>,
    #[serde(default)]
    signal_bytes: Option<Vec<u8>>,
    #[serde(default)]
    face_auth: Option<bool>,
}

fn js_request_to_core(req: JsRequestDto) -> Result<crate::Request, JsValue> {
    let signal = match (req.signal, req.signal_bytes) {
        (Some(s), None) => Some(Signal::from_string(s)),
        (None, Some(bytes)) => Some(Signal::from_abi_encoded(bytes)),
        (None, None) => None,
        (Some(_), Some(_)) => {
            return Err(JsValue::from_str(
                "Provide either signal (string) or signal_bytes, not both",
            ))
        }
    };

    let mut core_req = crate::Request::new(req.credential_type, signal);
    if let Some(face) = req.face_auth {
        core_req = core_req.with_face_auth(face);
    }
    Ok(core_req)
}

/// Encodes data to base64
#[must_use]
#[wasm_bindgen(js_name = base64Encode)]
pub fn base64_encode(data: &[u8]) -> String {
    crate::crypto::base64_encode(data)
}

/// Decodes base64 data
///
/// # Errors
///
/// Returns an error if decoding fails
#[wasm_bindgen(js_name = base64Decode)]
pub fn base64_decode(data: &str) -> Result<Vec<u8>, JsValue> {
    crate::crypto::base64_decode(data)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode failed: {e}")))
}

/// World ID verification session
///
/// Manages the verification flow with World App via the bridge.
#[wasm_bindgen]
pub struct Session {
    #[wasm_bindgen(skip)]
    inner: Rc<RefCell<Option<crate::Session>>>,
}

#[wasm_bindgen]
impl Session {
    /// Creates a new session from a verification level
    ///
    /// This is a convenience method that maps a verification level (like `"device"` or `"orb"`)
    /// to the appropriate set of credential requests and constraints.
    ///
    /// # Errors
    ///
    /// Returns an error if the session cannot be created or the request fails
    ///
    /// # Arguments
    ///
    /// * `app_id` - Application ID from the Developer Portal (e.g., `"app_staging_xxxxx"`)
    /// * `action` - Action identifier
    /// * `verification_level` - Verification level as string (`"orb"`, `"device"`, etc.)
    /// * `signal` - Optional signal string for cryptographic binding
    #[wasm_bindgen(constructor)]
    #[allow(clippy::new_ret_no_self)] // WASM async constructors return Promise
    pub fn new(
        app_id: String,
        action: String,
        verification_level: JsValue,
        signal: Option<String>,
    ) -> js_sys::Promise {
        future_to_promise(async move {
            // Parse app_id
            let app_id = crate::AppId::new(app_id)
                .map_err(|e| JsValue::from_str(&format!("Invalid app_id: {e}")))?;

            // Parse verification level
            let vl: VerificationLevel = serde_wasm_bindgen::from_value(verification_level)
                .map_err(|e| JsValue::from_str(&format!("Invalid verification_level: {e}")))?;

            // Create session
            let session = crate::Session::from_verification_level(
                app_id,
                action,
                vl,
                signal.unwrap_or_default(),
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to create session: {e}")))?;

            Ok(JsValue::from(Self {
                inner: Rc::new(RefCell::new(Some(session))),
            }))
        })
    }

    /// Creates a new session from explicit requests and optional constraints
    ///
    /// # Arguments
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `requests` - Array of objects: { `credential_type`, signal?, `signal_bytes`?, `face_auth`? }
    /// * `constraints` - Optional constraints JSON matching Rust `Constraints` (any/all of credential types)
    /// * `action_description` - Optional user-facing description
    /// * `bridge_url` - Optional custom bridge URL
    #[wasm_bindgen(js_name = createWithRequests)]
    pub fn create_with_requests(
        app_id: String,
        action: String,
        requests: JsValue,
        constraints: Option<JsValue>,
        action_description: Option<String>,
        bridge_url: Option<String>,
    ) -> js_sys::Promise {
        future_to_promise(async move {
            let app_id = crate::AppId::new(app_id)
                .map_err(|e| JsValue::from_str(&format!("Invalid app_id: {e}")))?;

            let req_vec: Vec<JsRequestDto> = serde_wasm_bindgen::from_value(requests)
                .map_err(|e| JsValue::from_str(&format!("Invalid requests payload: {e}")))?;
            if req_vec.is_empty() {
                return Err(JsValue::from_str("At least one request is required"));
            }
            let core_requests: Vec<crate::Request> = req_vec
                .into_iter()
                .map(js_request_to_core)
                .collect::<Result<_, _>>()?;

            let core_constraints = if let Some(c) = constraints {
                Some(
                    serde_wasm_bindgen::from_value::<crate::Constraints>(c).map_err(|e| {
                        JsValue::from_str(&format!("Invalid constraints payload: {e}"))
                    })?,
                )
            } else {
                // Default: any-of the provided credentials in order
                let nodes = core_requests
                    .iter()
                    .map(|r| crate::ConstraintNode::credential(r.credential_type))
                    .collect();
                Some(crate::Constraints::new(
                    crate::ConstraintNode::any(nodes),
                ))
            };

            let bridge_url_parsed = bridge_url
                .map(crate::BridgeUrl::new)
                .transpose()
                .map_err(|e| JsValue::from_str(&format!("Invalid bridge_url: {e}")))?;

            let session = crate::Session::create_with_options(
                app_id,
                action,
                core_requests,
                action_description,
                core_constraints,
                bridge_url_parsed,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to create session: {e}")))?;

            Ok(JsValue::from(Self {
                inner: Rc::new(RefCell::new(Some(session))),
            }))
        })
    }

    /// Returns the connect URL for World App
    ///
    /// This URL should be displayed as a QR code for users to scan with World App.
    ///
    /// # Errors
    ///
    /// Returns an error if the session has been closed
    #[wasm_bindgen(js_name = connectUrl)]
    pub fn connect_url(&self) -> Result<String, JsValue> {
        self.inner
            .borrow()
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Session closed"))
            .map(crate::Session::connect_url)
    }

    /// Returns the request ID for this session
    ///
    /// # Errors
    ///
    /// Returns an error if the session has been closed
    #[wasm_bindgen(js_name = requestId)]
    pub fn request_id(&self) -> Result<String, JsValue> {
        self.inner
            .borrow()
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Session closed"))
            .map(|s| s.request_id().to_string())
    }

    /// Polls the bridge for the current status (non-blocking)
    ///
    /// Returns a status object with type:
    /// - `"waiting_for_connection"` - Waiting for World App to retrieve the request
    /// - `"awaiting_confirmation"` - World App has retrieved the request, waiting for user
    /// - `"confirmed"` - User confirmed and provided a proof
    /// - `"failed"` - Request has failed
    ///
    /// # Errors
    ///
    /// Returns an error if the request fails or the response is invalid
    #[wasm_bindgen(js_name = pollForStatus)]
    pub fn poll_for_status(&self) -> js_sys::Promise {
        let inner = self.inner.clone();

        future_to_promise(async move {
            // Take session temporarily for async operation
            let session = inner
                .borrow_mut()
                .take()
                .ok_or_else(|| JsValue::from_str("Session closed"))?;

            let status = session
                .poll_for_status()
                .await
                .map_err(|e| JsValue::from_str(&format!("Poll failed: {e}")))?;

            // Put session back
            *inner.borrow_mut() = Some(session);

            // Convert Rust Status enum to JS object
            let js_status = match status {
                crate::Status::WaitingForConnection => {
                    serde_wasm_bindgen::to_value(&serde_json::json!({
                        "type": "waiting_for_connection"
                    }))
                }
                crate::Status::AwaitingConfirmation => {
                    serde_wasm_bindgen::to_value(&serde_json::json!({
                        "type": "awaiting_confirmation"
                    }))
                }
                crate::Status::Confirmed(proof) => {
                    serde_wasm_bindgen::to_value(&serde_json::json!({
                        "type": "confirmed",
                        "proof": proof
                    }))
                }
                crate::Status::Failed(error) => {
                    serde_wasm_bindgen::to_value(&serde_json::json!({
                        "type": "failed",
                        "error": error
                    }))
                }
            }
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))?;

            Ok(js_status)
        })
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
