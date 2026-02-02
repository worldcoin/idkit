//! WASM bindings for `IDKit`
//!
//! This module provides WebAssembly bindings for the core `IDKit` library,
//! allowing it to be used in browser environments.

#![allow(clippy::needless_pass_by_value)]
#![allow(clippy::missing_panics_doc)]
#![allow(clippy::future_not_send)]

use crate::preset::{OrbLegacyPreset, Preset};
use crate::{ConstraintNode, CredentialRequest, CredentialType, RpContext, Signal};
use serde::Serialize;
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Once;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

static PANIC_HOOK: Once = Once::new();

/// Initialize the WASM module.
/// This sets up panic hooks for better error messages in the browser console.
/// Safe to call multiple times - initialization only happens once.
#[wasm_bindgen(start)]
pub fn init_wasm() {
    PANIC_HOOK.call_once(|| {
        console_error_panic_hook::set_once();
    });
}

/// WASM wrapper for `CredentialRequest`
#[wasm_bindgen(js_name = CredentialRequestWasm)]
pub struct CredentialRequestWasm(CredentialRequest);

#[wasm_bindgen(js_class = CredentialRequestWasm)]
impl CredentialRequestWasm {
    /// Creates a new request item
    ///
    /// # Arguments
    /// * `credential_type` - The type of credential to request (e.g., "orb", "face")
    /// * `signal` - Optional signal string
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type is invalid
    #[wasm_bindgen(constructor)]
    pub fn new(credential_type: JsValue, signal: Option<String>) -> Result<Self, JsValue> {
        let cred: CredentialType = serde_wasm_bindgen::from_value(credential_type)?;
        let signal_opt = signal.map(Signal::from_string);
        Ok(Self(CredentialRequest::new(cred, signal_opt)))
    }

    /// Creates a new request item with ABI-encoded bytes for the signal
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type is invalid
    #[wasm_bindgen(js_name = withBytes)]
    pub fn with_bytes(credential_type: JsValue, signal_bytes: &[u8]) -> Result<Self, JsValue> {
        let cred: CredentialType = serde_wasm_bindgen::from_value(credential_type)?;
        Ok(Self(CredentialRequest::new(
            cred,
            Some(Signal::from_abi_encoded(signal_bytes)),
        )))
    }

    /// Creates a new request item with genesis minimum timestamp
    ///
    /// # Errors
    ///
    /// Returns an error if the credential type is invalid
    #[wasm_bindgen(js_name = withGenesisMin)]
    pub fn with_genesis_min(
        credential_type: JsValue,
        signal: Option<String>,
        genesis_min: u64,
    ) -> Result<Self, JsValue> {
        let cred: CredentialType = serde_wasm_bindgen::from_value(credential_type)?;
        let signal_opt = signal.map(Signal::from_string);
        Ok(Self(CredentialRequest::with_genesis_min(
            cred,
            signal_opt,
            genesis_min,
        )))
    }

    /// Gets the credential type
    #[must_use]
    #[wasm_bindgen(js_name = credentialType)]
    pub fn credential_type(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.0.credential_type).unwrap_or(JsValue::NULL)
    }

    /// Gets the signal as raw bytes
    #[must_use]
    #[wasm_bindgen(js_name = getSignalBytes)]
    pub fn get_signal_bytes(&self) -> Option<Vec<u8>> {
        self.0.signal.as_ref().map(Signal::as_bytes).map(Vec::from)
    }

    /// Converts the request item to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

/// WASM wrapper for `BridgeResponseV1` (legacy proof format)
#[wasm_bindgen]
pub struct IDKitProof(crate::BridgeResponseV1);

#[wasm_bindgen]
impl IDKitProof {
    /// Creates a new legacy proof (protocol v1 / World ID v3)
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
        Ok(Self(crate::BridgeResponseV1 {
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

/// RP Context for protocol-level proof requests (WASM binding)
///
/// Contains RP-specific data needed to construct a `ProofRequest`.
#[wasm_bindgen(js_name = RpContextWasm)]
pub struct RpContextWasm(RpContext);

#[wasm_bindgen(js_class = RpContextWasm)]
impl RpContextWasm {
    /// Creates a new RP context
    ///
    /// # Arguments
    /// * `rp_id` - The registered RP ID (e.g., `"rp_123456789abcdef0"`)
    /// * `nonce` - Unique nonce for this proof request
    /// * `created_at` - Unix timestamp (seconds since epoch) when created
    /// * `expires_at` - Unix timestamp (seconds since epoch) when expires
    /// * `signature` - The RP's ECDSA signature of the `nonce` and `created_at` timestamp
    ///
    /// # Errors
    ///
    /// Returns an error if `rp_id` is not a valid RP ID (must start with `rp_`)
    #[wasm_bindgen(constructor)]
    pub fn new(
        rp_id: String,
        nonce: String,
        created_at: u64,
        expires_at: u64,
        signature: String,
    ) -> Result<Self, JsValue> {
        let ctx = RpContext::new(rp_id, nonce, created_at, expires_at, signature)
            .map_err(|e| JsValue::from_str(&format!("Invalid RpContext: {e}")))?;
        Ok(Self(ctx))
    }

    /// Returns the inner `RpContext` (for internal use)
    pub(crate) fn into_inner(self) -> RpContext {
        self.0
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

/// Creates an `OrbLegacy` preset for World ID 3.0 legacy support
///
/// Returns a preset object that can be passed to `request().preset()`.
///
/// # Arguments
/// * `signal` - Optional signal string
///
/// # Errors
///
/// Returns an error if serialization fails
#[wasm_bindgen(js_name = orbLegacy)]
pub fn orb_legacy(signal: Option<String>) -> Result<JsValue, JsValue> {
    let preset = Preset::OrbLegacy(OrbLegacyPreset::new(signal));
    serde_wasm_bindgen::to_value(&preset).map_err(|e| JsValue::from_str(&e.to_string()))
}

// RP Signature wrapper for WASM
#[wasm_bindgen(js_name = RpSignature)]
pub struct RpSignatureWasm {
    sig: String,
    nonce: String,
    created_at: u64,
    expires_at: u64,
}

#[wasm_bindgen(js_class = RpSignature)]
impl RpSignatureWasm {
    /// Gets the signature as hex string (0x-prefixed, 65 bytes)
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn sig(&self) -> String {
        self.sig.clone()
    }

    /// Gets the nonce as hex string (0x-prefixed field element)
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn nonce(&self) -> String {
        self.nonce.clone()
    }

    /// Gets the creation timestamp
    #[must_use]
    #[wasm_bindgen(getter, js_name = createdAt)]
    pub fn created_at(&self) -> u64 {
        self.created_at
    }

    /// Gets the expiration timestamp
    #[must_use]
    #[wasm_bindgen(getter, js_name = expiresAt)]
    pub fn expires_at(&self) -> u64 {
        self.expires_at
    }

    /// Converts to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if setting object properties fails
    #[wasm_bindgen(js_name = toJSON)]
    #[allow(clippy::cast_precision_loss)]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"sig".into(), &self.sig.clone().into())?;
        js_sys::Reflect::set(&obj, &"nonce".into(), &self.nonce.clone().into())?;
        // Convert u64 to f64 to avoid BigInt serialization issues in JSON
        // Note: This may lose precision for values > 2^53, but timestamps fit within safe integer range
        js_sys::Reflect::set(&obj, &"createdAt".into(), &(self.created_at as f64).into())?;
        js_sys::Reflect::set(&obj, &"expiresAt".into(), &(self.expires_at as f64).into())?;
        Ok(obj.into())
    }
}

/// Signs an RP request for World ID proof verification
///
/// **Backend-only**: This function should only be used in server-side environments.
/// Never expose your signing key to client-side code.
///
/// This function generates a cryptographic signature that RPs use to authenticate
/// proof requests. It:
/// 1. Generates a random nonce
/// 2. Gets the current timestamp
/// 3. Computes: keccak256(nonce || action || timestamp || `expires_at`)
/// 4. Signs the hash with ECDSA secp256k1
///
/// # Arguments
/// * `action` - The action identifier string (e.g., "verify-human")
/// * `signing_key_hex` - The ECDSA private key as hex (0x-prefixed or not, 32 bytes)
/// * `ttl_seconds` - Optional time-to-live in seconds (defaults to 300 = 5 minutes)
///
/// # Returns
/// An `RpSignature` object containing the signature, nonce, and timestamps
/// to be passed as `rp_context` in the proof request
///
/// # Errors
/// Returns an error if:
/// - The signing key is invalid hex or wrong length
/// - Random generation fails
/// - Signing fails
///
/// # Example
/// ```javascript
/// import { signRequest } from '@worldcoin/idkit-core'
///
/// const signingKey = process.env.RP_SIGNING_KEY // Load from secure env var
/// const signature = signRequest('my-action', signingKey) // default 5 min TTL
/// const customTtl = signRequest('my-action', signingKey, 600) // 10 min TTL
/// console.log(signature.sig, signature.nonce, signature.createdAt, signature.expiresAt)
/// ```
#[wasm_bindgen(js_name = signRequest)]
pub fn compute_rp_signature_wasm(
    action: &str,
    signing_key_hex: &str,
    ttl_seconds: Option<u64>,
) -> Result<RpSignatureWasm, JsValue> {
    #[cfg(feature = "rp-signature")]
    {
        use world_id_primitives::FieldElement;

        let action = FieldElement::from_arbitrary_raw_bytes(action.as_bytes());

        // Compute signature using core implementation
        let sig = crate::rp_signature::compute_rp_signature(signing_key_hex, action, ttl_seconds)
            .map_err(|e| JsValue::from_str(&format!("Signature computation failed: {e}")))?;

        Ok(RpSignatureWasm {
            sig: sig.sig,
            nonce: sig.nonce,
            created_at: sig.created_at,
            expires_at: sig.expires_at,
        })
    }

    #[cfg(not(feature = "rp-signature"))]
    {
        Err(JsValue::from_str("RP signature feature not enabled"))
    }
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

/// Builder for creating `IDKit` requests (WASM)
#[wasm_bindgen(js_name = IDKitRequestBuilderWasm)]
pub struct IDKitRequestBuilderWasm {
    app_id: String,
    action: String,
    rp_context: RpContext,
    action_description: Option<String>,
    bridge_url: Option<String>,
    allow_legacy_proofs: bool,
}

#[wasm_bindgen(js_class = IDKitRequestBuilderWasm)]
impl IDKitRequestBuilderWasm {
    /// Creates a new `IDKitRequestBuilder`
    ///
    /// # Arguments
    /// * `app_id` - Application ID from the Developer Portal
    /// * `action` - Action identifier
    /// * `rp_context` - RP context for building protocol-level `ProofRequest`
    /// * `action_description` - Optional action description shown to users
    /// * `bridge_url` - Optional bridge URL (defaults to production)
    /// * `allow_legacy_proofs` - Whether to accept legacy (v3) proofs as fallback
    #[must_use]
    #[wasm_bindgen(constructor)]
    pub fn new(
        app_id: String,
        action: String,
        rp_context: RpContextWasm,
        action_description: Option<String>,
        bridge_url: Option<String>,
        allow_legacy_proofs: bool,
    ) -> Self {
        Self {
            app_id,
            action,
            rp_context: rp_context.into_inner(),
            action_description,
            bridge_url,
            allow_legacy_proofs,
        }
    }

    /// Creates an `IDKit` request with the given constraints
    ///
    /// # Arguments
    /// * `constraints_json` - Constraint tree as JSON (`CredentialRequest` or `{any: []}` or `{all: []}`)
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created
    pub fn constraints(self, constraints_json: JsValue) -> js_sys::Promise {
        let app_id = self.app_id;
        let action = self.action;
        let rp_context = self.rp_context;
        let action_description = self.action_description;
        let bridge_url = self.bridge_url;
        let allow_legacy_proofs = self.allow_legacy_proofs;

        future_to_promise(async move {
            let app_id = crate::AppId::new(&app_id)
                .map_err(|e| JsValue::from_str(&format!("Invalid app_id: {e}")))?;

            let constraints: ConstraintNode = serde_wasm_bindgen::from_value(constraints_json)
                .map_err(|e| JsValue::from_str(&format!("Invalid constraints payload: {e}")))?;

            let bridge_url_parsed = bridge_url
                .map(|url| crate::BridgeUrl::new(url, &app_id))
                .transpose()
                .map_err(|e| JsValue::from_str(&format!("Invalid bridge_url: {e}")))?;

            let request = crate::IDKitRequest::create(
                app_id,
                crate::bridge::RequestKind::Uniqueness { action },
                constraints,
                rp_context,
                action_description,
                crate::VerificationLevel::Deprecated,
                String::new(),
                bridge_url_parsed,
                allow_legacy_proofs,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to create request: {e}")))?;

            Ok(JsValue::from(IDKitRequest {
                inner: Rc::new(RefCell::new(Some(request))),
            }))
        })
    }

    /// Creates an `IDKit` request from a preset
    ///
    /// Presets provide a simplified way to create requests with predefined
    /// credential configurations. The preset is converted to both World ID 4.0
    /// constraints and World ID 3.0 legacy fields for backward compatibility.
    ///
    /// # Arguments
    /// * `preset_json` - Preset object from `orbLegacy()`
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created
    pub fn preset(self, preset_json: JsValue) -> js_sys::Promise {
        let app_id = self.app_id;
        let action = self.action;
        let rp_context = self.rp_context;
        let action_description = self.action_description;
        let bridge_url = self.bridge_url;
        let allow_legacy_proofs = self.allow_legacy_proofs;

        future_to_promise(async move {
            let preset: Preset = serde_wasm_bindgen::from_value(preset_json)
                .map_err(|e| JsValue::from_str(&format!("Invalid preset: {e}")))?;

            let app_id_parsed = crate::AppId::new(&app_id)
                .map_err(|e| JsValue::from_str(&format!("Invalid app_id: {e}")))?;

            let bridge_url_parsed = bridge_url
                .map(|url| crate::BridgeUrl::new(url, &app_id_parsed))
                .transpose()
                .map_err(|e| JsValue::from_str(&format!("Invalid bridge_url: {e}")))?;

            // Convert preset to constraints + legacy params
            let (constraints, legacy_verification_level, legacy_signal) = preset.to_bridge_params();

            let request = crate::IDKitRequest::create(
                app_id_parsed,
                crate::bridge::RequestKind::Uniqueness { action },
                constraints,
                rp_context,
                action_description,
                legacy_verification_level,
                legacy_signal.unwrap_or_default(),
                bridge_url_parsed,
                allow_legacy_proofs,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to create request: {e}")))?;

            Ok(JsValue::from(IDKitRequest {
                inner: Rc::new(RefCell::new(Some(request))),
            }))
        })
    }
}

/// Entry point for creating `IDKit` requests (WASM)
///
/// # Arguments
/// * `app_id` - Application ID from the Developer Portal
/// * `action` - Action identifier
/// * `rp_context` - RP context for building protocol-level `ProofRequest`
/// * `action_description` - Optional action description shown to users
/// * `bridge_url` - Optional bridge URL (defaults to production)
/// * `allow_legacy_proofs` - Whether to accept legacy (v3) proofs as fallback
#[must_use]
#[wasm_bindgen(js_name = request)]
pub fn request(
    app_id: String,
    action: String,
    rp_context: RpContextWasm,
    action_description: Option<String>,
    bridge_url: Option<String>,
    allow_legacy_proofs: bool,
) -> IDKitRequestBuilderWasm {
    IDKitRequestBuilderWasm::new(
        app_id,
        action,
        rp_context,
        action_description,
        bridge_url,
        allow_legacy_proofs,
    )
}

/// Builder for creating session requests (WASM)
#[wasm_bindgen(js_name = IDKitSessionBuilderWasm)]
pub struct IDKitSessionBuilderWasm {
    app_id: String,
    session_id: Option<String>,
    rp_context: RpContext,
    action_description: Option<String>,
    bridge_url: Option<String>,
    allow_legacy_proofs: bool,
}

#[wasm_bindgen(js_class = IDKitSessionBuilderWasm)]
impl IDKitSessionBuilderWasm {
    /// Creates a new session builder for creating a new session (no existing `session_id`)
    #[must_use]
    #[wasm_bindgen(constructor)]
    pub fn new(
        app_id: String,
        rp_context: RpContextWasm,
        action_description: Option<String>,
        bridge_url: Option<String>,
        allow_legacy_proofs: bool,
    ) -> Self {
        Self {
            app_id,
            session_id: None,
            rp_context: rp_context.into_inner(),
            action_description,
            bridge_url,
            allow_legacy_proofs,
        }
    }

    /// Creates a new session builder for proving an existing session
    #[must_use]
    #[wasm_bindgen(js_name = withSessionId)]
    pub fn with_session_id(
        session_id: String,
        app_id: String,
        rp_context: RpContextWasm,
        action_description: Option<String>,
        bridge_url: Option<String>,
        allow_legacy_proofs: bool,
    ) -> Self {
        Self {
            app_id,
            session_id: Some(session_id),
            rp_context: rp_context.into_inner(),
            action_description,
            bridge_url,
            allow_legacy_proofs,
        }
    }

    /// Creates a session request with the given constraints
    ///
    /// # Arguments
    /// * `constraints_json` - Constraint tree as JSON
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be created
    pub fn constraints(self, constraints_json: JsValue) -> js_sys::Promise {
        let app_id = self.app_id;
        let session_id = self.session_id;
        let rp_context = self.rp_context;
        let action_description = self.action_description;
        let bridge_url = self.bridge_url;
        let allow_legacy_proofs = self.allow_legacy_proofs;

        future_to_promise(async move {
            let app_id = crate::AppId::new(&app_id)
                .map_err(|e| JsValue::from_str(&format!("Invalid app_id: {e}")))?;

            let constraints: ConstraintNode = serde_wasm_bindgen::from_value(constraints_json)
                .map_err(|e| JsValue::from_str(&format!("Invalid constraints payload: {e}")))?;

            let bridge_url_parsed = bridge_url
                .map(|url| crate::BridgeUrl::new(url, &app_id))
                .transpose()
                .map_err(|e| JsValue::from_str(&format!("Invalid bridge_url: {e}")))?;

            // Determine request kind based on session_id presence
            let kind = session_id.map_or(crate::bridge::RequestKind::CreateSession, |sid| {
                crate::bridge::RequestKind::ProveSession { session_id: sid }
            });

            let request = crate::IDKitRequest::create(
                app_id,
                kind,
                constraints,
                rp_context,
                action_description,
                crate::VerificationLevel::Deprecated,
                String::new(),
                bridge_url_parsed,
                allow_legacy_proofs,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to create session request: {e}")))?;

            Ok(JsValue::from(IDKitRequest {
                inner: Rc::new(RefCell::new(Some(request))),
            }))
        })
    }
}

/// Entry point for creating a new session (no existing `session_id`) (WASM)
///
/// Use this when creating a new session for a user who doesn't have one yet.
/// The response will include a `session_id` that should be saved for future
/// session proofs.
///
/// # Arguments
/// * `app_id` - Application ID from the Developer Portal
/// * `rp_context` - RP context for building protocol-level `ProofRequest`
/// * `action_description` - Optional action description shown to users
/// * `bridge_url` - Optional bridge URL (defaults to production)
/// * `allow_legacy_proofs` - Whether to accept legacy (v3) proofs as fallback
#[must_use]
#[wasm_bindgen(js_name = createSession)]
pub fn create_session(
    app_id: String,
    rp_context: RpContextWasm,
    action_description: Option<String>,
    bridge_url: Option<String>,
    allow_legacy_proofs: bool,
) -> IDKitSessionBuilderWasm {
    IDKitSessionBuilderWasm::new(
        app_id,
        rp_context,
        action_description,
        bridge_url,
        allow_legacy_proofs,
    )
}

/// Entry point for proving an existing session (WASM)
///
/// Use this when a returning user needs to prove they own an existing session.
/// The `session_id` should be a value previously returned from `createSession()`.
///
/// # Arguments
/// * `session_id` - The session ID from a previous session creation
/// * `app_id` - Application ID from the Developer Portal
/// * `rp_context` - RP context for building protocol-level `ProofRequest`
/// * `action_description` - Optional action description shown to users
/// * `bridge_url` - Optional bridge URL (defaults to production)
/// * `allow_legacy_proofs` - Whether to accept legacy (v3) proofs as fallback
#[must_use]
#[wasm_bindgen(js_name = proveSession)]
pub fn prove_session(
    session_id: String,
    app_id: String,
    rp_context: RpContextWasm,
    action_description: Option<String>,
    bridge_url: Option<String>,
    allow_legacy_proofs: bool,
) -> IDKitSessionBuilderWasm {
    IDKitSessionBuilderWasm::with_session_id(
        session_id,
        app_id,
        rp_context,
        action_description,
        bridge_url,
        allow_legacy_proofs,
    )
}

/// World ID verification request
///
/// Manages the verification flow with World App via the bridge.
#[wasm_bindgen]
pub struct IDKitRequest {
    #[wasm_bindgen(skip)]
    inner: Rc<RefCell<Option<crate::IDKitRequest>>>,
}

#[wasm_bindgen]
impl IDKitRequest {
    /// Returns the connect URL for World App
    ///
    /// This URL should be displayed as a QR code for users to scan with World App.
    ///
    /// # Errors
    ///
    /// Returns an error if the request has been closed
    #[wasm_bindgen(js_name = connectUrl)]
    pub fn connect_url(&self) -> Result<String, JsValue> {
        self.inner
            .borrow()
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Request closed"))
            .map(crate::IDKitRequest::connect_url)
    }

    /// Returns the request ID for this request
    ///
    /// # Errors
    ///
    /// Returns an error if the request has been closed
    #[wasm_bindgen(js_name = requestId)]
    pub fn request_id(&self) -> Result<String, JsValue> {
        self.inner
            .borrow()
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Request closed"))
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
            // Take request temporarily for async operation
            let request = inner
                .borrow_mut()
                .take()
                .ok_or_else(|| JsValue::from_str("Request closed"))?;

            let status = request
                .poll_for_status()
                .await
                .map_err(|e| JsValue::from_str(&format!("Poll failed: {e}")))?;

            // Put request back
            *inner.borrow_mut() = Some(request);

            // Convert Rust Status enum to plain JS object
            // Use serialize_maps_as_objects(true) to return plain objects instead of Maps
            let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);

            let js_status = match status {
                crate::Status::WaitingForConnection => {
                    serde_json::json!({"type": "waiting_for_connection"}).serialize(&serializer)
                }
                crate::Status::AwaitingConfirmation => {
                    serde_json::json!({"type": "awaiting_confirmation"}).serialize(&serializer)
                }
                crate::Status::Confirmed(result) => {
                    serde_json::json!({"type": "confirmed", "result": result})
                        .serialize(&serializer)
                }
                crate::Status::Failed(error) => {
                    serde_json::json!({"type": "failed", "error": format!("{error:?}")})
                        .serialize(&serializer)
                }
            }
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))?;

            Ok(js_status)
        })
    }
}

// TypeScript type definitions
#[wasm_bindgen(typescript_custom_section)]
const TS_TYPES: &str = r#"
export type CredentialType = "orb" | "face" | "secure_document" | "document" | "device";

export interface CredentialRequestType {
    type: CredentialType;
    signal?: string;
    genesis_issued_at_min?: number;
}

export type ConstraintNode =
    | CredentialRequestType
    | { any: ConstraintNode[] }
    | { all: ConstraintNode[] };
"#;

// Export ResponseItem/IDKitResult types for unified response
#[wasm_bindgen(typescript_custom_section)]
const TS_IDKIT_RESULT: &str = r#"
/** V4 response item (protocol version 4.0 / World ID v4) */
export interface ResponseItemV4 {
    /** Credential identifier */
    identifier: CredentialType;
    /** Compressed Groth16 proof (hex) */
    proof: string;
    /** RP-scoped nullifier (hex) - present for action proofs */
    nullifier?: string;
    /** Session nullifier (hex) - present for session proofs */
    session_nullifier?: string;
    /** Authenticator merkle root (hex) */
    merkle_root: string;
    /** Unix timestamp when proof was generated */
    proof_timestamp: number;
    /** Credential issuer schema ID (hex) */
    issuer_schema_id: string;
}

/** V3 response item (protocol version 3.0 / World ID v3 - legacy format) */
export interface ResponseItemV3 {
    /** Credential identifier */
    identifier: CredentialType;
    /** ABI-encoded proof (hex) */
    proof: string;
    /** Merkle root (hex) */
    merkle_root: string;
    /** Nullifier hash (hex) */
    nullifier_hash: string;
}

/**
 * A single credential response item - unified type for both bridge and SDK.
 * Type narrowing: use 'proof_timestamp' in item for V4, 'nullifier_hash' in item for V3.
 */
export type ResponseItem = ResponseItemV4 | ResponseItemV3;

/** V3 result (legacy format - no session support) */
export interface IDKitResultV3 {
    /** Protocol version 3.0 */
    protocol_version: "3.0";
    /** Array of V3 credential responses */
    responses: ResponseItemV3[];
}

/** V4 result (current format - supports sessions) */
export interface IDKitResultV4 {
    /** Protocol version 4.0 */
    protocol_version: "4.0";
    /** Session ID (for session proofs) */
    session_id?: string;
    /** Array of V4 credential responses */
    responses: ResponseItemV4[];
}

/** The unified response structure - discriminated union by protocol_version */
export type IDKitResult = IDKitResultV3 | IDKitResultV4;

/** Configuration for session requests (no action field) */
export interface IDKitSessionConfig {
    /** Application ID from the Developer Portal */
    app_id: `app_${string}`;
    /** RP context for protocol-level proof requests */
    rp_context: RpContext;
    /** Optional action description shown to users */
    action_description?: string;
    /** Optional bridge URL (defaults to production) */
    bridge_url?: string;
    /** Whether to accept legacy (v3) proofs as fallback */
    allow_legacy_proofs: boolean;
}

/** RpContext for proof requests */
export interface RpContext {
    /** The registered RP ID (e.g., "rp_123456789abcdef0") */
    rp_id: string;
    /** Unique nonce for this proof request */
    nonce: string;
    /** Unix timestamp (seconds since epoch) when created */
    created_at: number;
    /** Unix timestamp (seconds since epoch) when expires */
    expires_at: number;
    /** The RP's ECDSA signature of the nonce and created_at timestamp */
    signature: string;
}

/** Status returned from pollForStatus() */
export type Status =
    | { type: "waiting_for_connection" }
    | { type: "awaiting_confirmation" }
    | { type: "confirmed"; result: IDKitResult }
    | { type: "failed"; error: string };
"#;

// Export preset types
#[wasm_bindgen(typescript_custom_section)]
const TS_PRESET: &str = r#"
export interface OrbLegacyPreset {
    type: "OrbLegacy";
    data: { signal?: string };
}

export type Preset = OrbLegacyPreset;

export function orbLegacy(signal?: string): Preset;
"#;

// Export RP signature types
#[wasm_bindgen(typescript_custom_section)]
const TS_RP_SIGNATURE: &str = r#"
export interface RpSignature {
    sig: string;
    nonce: string;
    createdAt: number;
    expiresAt: number;
    toJSON(): { sig: string; nonce: string; createdAt: number; expiresAt: number };
}

export function signRequest(action: string, signingKeyHex: string, ttlSeconds?: number): RpSignature;
"#;

// Export session function types
#[wasm_bindgen(typescript_custom_section)]
const TS_SESSION: &str = r#"
/**
 * Creates a new session builder for creating a new session (no existing session_id).
 * Use this when creating a new session for a user who doesn't have one yet.
 * The response will include a session_id that should be saved for future session proofs.
 */
export function createSession(
    app_id: string,
    rp_context: RpContextWasm,
    action_description?: string,
    bridge_url?: string,
    allow_legacy_proofs: boolean
): IDKitSessionBuilderWasm;

/**
 * Creates a session builder for proving an existing session.
 * Use this when a returning user needs to prove they own an existing session.
 */
export function proveSession(
    session_id: string,
    app_id: string,
    rp_context: RpContextWasm,
    action_description?: string,
    bridge_url?: string,
    allow_legacy_proofs: boolean
): IDKitSessionBuilderWasm;
"#;
