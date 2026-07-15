//! Contract tests for the C ABI envelope, argument validation, payload
//! construction, and handle lifecycle. These exercise the exact entry points
//! the Kotlin Multiplatform SDK calls.

use std::ffi::{c_char, CStr, CString};

use idkit_kmp::{
    idkit_kmp_bridge_payload_from_constraints, idkit_kmp_bridge_payload_from_preset,
    idkit_kmp_hash_signal_bytes, idkit_kmp_hash_signal_string, idkit_kmp_request_free,
    idkit_kmp_request_poll_once, idkit_kmp_string_free, idkit_kmp_version,
};

/// Consumes an envelope pointer: copies the JSON out and frees the C string.
fn consume(ptr: *mut c_char) -> serde_json::Value {
    assert!(!ptr.is_null(), "FFI function returned NULL");
    let json = unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .expect("envelope must be UTF-8")
        .to_owned();
    unsafe { idkit_kmp_string_free(ptr) };
    serde_json::from_str(&json).expect("envelope must be valid JSON")
}

fn expect_ok(ptr: *mut c_char) -> serde_json::Value {
    let envelope = consume(ptr);
    assert!(
        envelope.get("ok").is_some(),
        "expected ok envelope, got: {envelope}"
    );
    envelope["ok"].clone()
}

fn expect_err(ptr: *mut c_char) -> (String, String) {
    let envelope = consume(ptr);
    let err = envelope
        .get("err")
        .unwrap_or_else(|| panic!("expected err envelope, got: {envelope}"));
    (
        err["code"].as_str().expect("err.code").to_owned(),
        err["message"].as_str().expect("err.message").to_owned(),
    )
}

fn cstring(s: &str) -> CString {
    CString::new(s).unwrap()
}

/// Matches the fixed RpContext used by the existing Kotlin/Swift SDK tests
/// (created_at in the past is accepted; only future timestamps are rejected;
/// the signature must be a well-formed 65-byte hex ECDSA signature).
fn sample_config_json() -> String {
    let signature = format!("0x{}1b", "00".repeat(64));
    serde_json::json!({
        "app_id": "app_staging_1234567890abcdef",
        "package_name": "idkit_kmp",
        "package_version": "0.1.0",
        "action": "test-action",
        "rp_context": {
            "rp_id": "rp_1234567890abcdef",
            "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001",
            "created_at": 1_700_000_000u64,
            "expires_at": 1_700_003_600u64,
            "signature": signature
        },
        "action_description": "Identity check",
        "allow_legacy_proofs": false,
        "require_user_presence": true,
        "return_to": "idkitsample://callback",
        "environment": "staging"
    })
    .to_string()
}

#[test]
fn version_returns_ok_envelope() {
    let version = expect_ok(idkit_kmp_version());
    assert_eq!(version.as_str().unwrap(), env!("CARGO_PKG_VERSION"));
}

#[test]
fn hash_signal_string_and_bytes_agree() {
    let signal = cstring("test-signal");
    let from_string = expect_ok(unsafe { idkit_kmp_hash_signal_string(signal.as_ptr()) });
    let bytes = b"test-signal";
    let from_bytes =
        expect_ok(unsafe { idkit_kmp_hash_signal_bytes(bytes.as_ptr(), bytes.len() as u64) });

    let hash = from_string.as_str().unwrap();
    assert_eq!(hash, from_bytes.as_str().unwrap());
    assert!(hash.starts_with("0x"), "hash must be 0x-prefixed: {hash}");
    assert_eq!(hash.len(), 66, "hash must be a 32-byte hex value");

    // Deterministic across calls.
    let again = expect_ok(unsafe { idkit_kmp_hash_signal_string(signal.as_ptr()) });
    assert_eq!(hash, again.as_str().unwrap());
}

#[test]
fn hash_signal_rejects_null_and_invalid_utf8() {
    let (code, _) = expect_err(unsafe { idkit_kmp_hash_signal_string(std::ptr::null()) });
    assert_eq!(code, "invalid_argument");

    let invalid = [0xFFu8, 0xFE, 0x00];
    let (code, message) =
        expect_err(unsafe { idkit_kmp_hash_signal_string(invalid.as_ptr().cast::<c_char>()) });
    assert_eq!(code, "invalid_argument");
    assert!(message.contains("UTF-8"), "message: {message}");

    let (code, _) = expect_err(unsafe { idkit_kmp_hash_signal_bytes(std::ptr::null(), 4) });
    assert_eq!(code, "invalid_argument");
}

#[test]
fn bridge_payload_from_identity_check_preset_matches_contract() {
    let config = cstring(&sample_config_json());
    let preset = cstring(
        &serde_json::json!({
            "type": "IdentityCheck",
            "attributes": [
                { "type": "minimum_age", "value": 21 },
                { "type": "nationality", "value": "JPN" }
            ],
            "legacy_signal": null
        })
        .to_string(),
    );

    let payload = expect_ok(unsafe {
        idkit_kmp_bridge_payload_from_preset(config.as_ptr(), preset.as_ptr())
    });

    assert_eq!(payload["app_id"], "app_staging_1234567890abcdef");
    assert_eq!(payload["package_name"], "idkit_kmp");
    assert_eq!(payload["package_version"], "0.1.0");
    assert_eq!(payload["action"], "test-action");
    assert_eq!(payload["action_description"], "Identity check");
    assert_eq!(payload["verification_level"], "document");
    assert_eq!(payload["require_user_presence"], true);
    // IdentityCheck overrides allow_legacy_proofs to true (see Preset::into_bridge_params).
    assert_eq!(payload["allow_legacy_proofs"], true);
    assert_eq!(payload["return_to_url"], "idkitsample://callback");
    assert_eq!(payload["environment"], "staging");
    assert!(
        payload.get("timestamp").is_none(),
        "bridge path has no timestamp"
    );

    assert_eq!(
        payload["identity_attributes"],
        serde_json::json!([
            { "type": "minimum_age", "value": 21 },
            { "type": "nationality", "value": "JPN" }
        ])
    );

    let proof_request = &payload["proof_request"];
    assert_eq!(proof_request["proof_type"], "uniqueness");
    assert_eq!(proof_request["rp_id"], "rp_1234567890abcdef");
    assert_eq!(proof_request["created_at"], 1_700_000_000u64);
    assert_eq!(proof_request["expires_at"], 1_700_003_600u64);
}

#[test]
fn bridge_payload_from_constraints_matches_contract() {
    let config = cstring(&sample_config_json());
    let constraints = cstring(
        &serde_json::json!({ "any": [ { "type": "passport" }, { "type": "mnc" } ] }).to_string(),
    );

    let payload = expect_ok(unsafe {
        idkit_kmp_bridge_payload_from_constraints(config.as_ptr(), constraints.as_ptr())
    });

    // Constraint requests keep Device for v3 parser compatibility; real
    // selection lives in proof_request.
    assert_eq!(payload["verification_level"], "device");
    assert_eq!(payload["allow_legacy_proofs"], false);
    assert!(payload["proof_request"].is_object(), "payload: {payload}");
}

#[test]
fn invalid_config_and_preset_yield_error_envelopes() {
    let preset = cstring(r#"{"type":"OrbLegacy"}"#);

    let (code, message) = expect_err(unsafe {
        idkit_kmp_bridge_payload_from_preset(cstring("not json").as_ptr(), preset.as_ptr())
    });
    assert_eq!(code, "invalid_json");
    assert!(message.contains("config_json"), "message: {message}");

    let bad_app_id = sample_config_json().replace("app_staging_1234567890abcdef", "bogus");
    let (code, _) = expect_err(unsafe {
        idkit_kmp_bridge_payload_from_preset(cstring(&bad_app_id).as_ptr(), preset.as_ptr())
    });
    assert_eq!(code, "malformed_request");

    // Unknown config fields fail loudly instead of being silently dropped.
    let drifted = sample_config_json().replace("\"action\"", "\"acton\"");
    let (code, _) = expect_err(unsafe {
        idkit_kmp_bridge_payload_from_preset(cstring(&drifted).as_ptr(), preset.as_ptr())
    });
    assert_eq!(code, "invalid_json");

    let (code, message) = expect_err(unsafe {
        idkit_kmp_bridge_payload_from_preset(
            cstring(&sample_config_json()).as_ptr(),
            cstring(r#"{"type":"NoSuchPreset"}"#).as_ptr(),
        )
    });
    assert_eq!(code, "invalid_json");
    assert!(message.contains("preset_json"), "message: {message}");
}

#[test]
fn future_created_at_is_rejected() {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let config = sample_config_json()
        .replace("1700000000", &(now + 3_600).to_string())
        .replace("1700003600", &(now + 7_200).to_string());
    let preset = cstring(r#"{"type":"OrbLegacy"}"#);
    let (code, message) = expect_err(unsafe {
        idkit_kmp_bridge_payload_from_preset(cstring(&config).as_ptr(), preset.as_ptr())
    });
    assert_eq!(code, "malformed_request");
    assert!(message.contains("created_at"), "message: {message}");
}

#[test]
fn handle_lifecycle_is_safe() {
    // Handle 0 is never allocated (allocation starts at 1).
    let (code, message) = expect_err(idkit_kmp_request_poll_once(0));
    assert_eq!(code, "invalid_handle");
    assert!(message.contains('0'), "message: {message}");

    // Freeing unknown handles (and double-freeing) is a no-op.
    idkit_kmp_request_free(0);
    idkit_kmp_request_free(u64::MAX);
    idkit_kmp_request_free(u64::MAX);
}

#[test]
fn string_free_accepts_null() {
    unsafe { idkit_kmp_string_free(std::ptr::null_mut()) };
}
