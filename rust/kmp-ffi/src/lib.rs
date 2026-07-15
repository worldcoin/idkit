//! C ABI facade over `idkit-core` for the `IDKit` Kotlin Multiplatform SDK.
//!
//! Contract (mirrored by `include/idkit_kmp.h` and Kotlin's `NativeBridge`):
//! - Every function returns a heap-allocated, NUL-terminated UTF-8 JSON envelope:
//!   `{"ok": <value>}` on success or `{"err": {"code", "message"}}` on failure.
//! - Callers free every returned string with [`idkit_kmp_string_free`].
//! - Requests are opaque `u64` handles; freeing is idempotent.
//! - Panics never unwind across the boundary — they become `internal_panic`
//!   envelopes. This requires a `panic=unwind` build profile; Android builds use
//!   the `kmp-android-release` workspace profile for exactly this reason.
//! - Network-bound calls (`request_create_*`, `request_poll_once`) block the
//!   calling thread with a bounded deadline; Kotlin dispatches them off the
//!   main thread.

#![deny(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]
// The exported functions return owned C strings the caller must free; a
// #[must_use] on every extern fn adds nothing for FFI callers.
#![allow(clippy::must_use_candidate)]
// Keep helper visibility explicit at pub(crate) even inside private modules.
#![allow(clippy::redundant_pub_crate)]

mod config;
mod envelope;
mod registry;

use std::ffi::{c_char, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::Duration;

use envelope::{err_cstring, ok_cstring, panic_message, FfiError};

/// Bounded deadline for a single bridge network call. The Kotlin poll loop
/// treats the resulting timeout as a retryable networking error, so a hung
/// connection can never wedge a caller indefinitely.
const NETWORK_CALL_TIMEOUT: Duration = Duration::from_secs(30);

/// Runs `f` inside `catch_unwind` and always returns an envelope C string:
/// no panic crosses the FFI boundary and no error is swallowed.
fn ffi_boundary(f: impl FnOnce() -> Result<serde_json::Value, FfiError>) -> *mut c_char {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(Ok(value)) => ok_cstring(&value),
        Ok(Err(error)) => err_cstring(&error.code(), &error.message()),
        Err(payload) => err_cstring("internal_panic", &panic_message(payload.as_ref())),
    }
}

/// Reads a required UTF-8 C string argument.
///
/// # Safety
///
/// `ptr` must be null or a valid NUL-terminated string that outlives the call.
unsafe fn read_str<'a>(ptr: *const c_char, name: &str) -> Result<&'a str, FfiError> {
    if ptr.is_null() {
        return Err(FfiError::InvalidArgument(format!(
            "{name} must not be null"
        )));
    }
    CStr::from_ptr(ptr)
        .to_str()
        .map_err(|_| FfiError::InvalidArgument(format!("{name} must be valid UTF-8")))
}

fn parse_json<T: serde::de::DeserializeOwned>(json: &str, name: &str) -> Result<T, FfiError> {
    serde_json::from_str(json).map_err(|error| FfiError::Json(format!("{name}: {error}")))
}

/// Awaits a bridge future on the shared runtime with a bounded deadline.
fn block_on_bridge<T>(
    future: impl std::future::Future<Output = idkit::Result<T>>,
) -> Result<T, FfiError> {
    registry::runtime()?
        .block_on(async { tokio::time::timeout(NETWORK_CALL_TIMEOUT, future).await })
        .map_err(|_elapsed| FfiError::Core(idkit::Error::Timeout))?
        .map_err(FfiError::Core)
}

fn create_request(
    params: idkit::bridge::BridgeConnectionParams,
    mode: config::ConnectUrlMode,
) -> Result<serde_json::Value, FfiError> {
    let conn = block_on_bridge(idkit::BridgeConnection::create(params))?;
    let connect_url = mode.apply(conn.connect_url());
    let request_id = conn.request_id().to_owned();
    let handle = registry::insert_request(conn);
    Ok(serde_json::json!({
        "handle": handle,
        "connect_url": connect_url,
        "request_id": request_id,
    }))
}

/// ok: the crate version string.
#[no_mangle]
pub extern "C" fn idkit_kmp_version() -> *mut c_char {
    ffi_boundary(|| {
        Ok(serde_json::Value::String(
            env!("CARGO_PKG_VERSION").to_owned(),
        ))
    })
}

/// ok: `0x`-prefixed field-element hex of the hashed signal.
///
/// # Safety
///
/// `signal` must be null or a valid NUL-terminated UTF-8 string.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_hash_signal_string(signal: *const c_char) -> *mut c_char {
    ffi_boundary(|| {
        let signal = read_str(signal, "signal")?;
        Ok(serde_json::Value::String(idkit::crypto::hash_signal(
            &idkit::types::Signal::from_string(signal),
        )))
    })
}

/// ok: `0x`-prefixed field-element hex of the hashed signal bytes.
///
/// # Safety
///
/// `bytes` must point to `len` readable bytes; it may be null iff `len == 0`.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_hash_signal_bytes(bytes: *const u8, len: u64) -> *mut c_char {
    ffi_boundary(|| {
        let data = if len == 0 {
            Vec::new()
        } else if bytes.is_null() {
            return Err(FfiError::InvalidArgument(
                "bytes must not be null when len > 0".to_owned(),
            ));
        } else {
            let len = usize::try_from(len)
                .map_err(|_| FfiError::InvalidArgument("len does not fit in usize".to_owned()))?;
            std::slice::from_raw_parts(bytes, len).to_vec()
        };
        Ok(serde_json::Value::String(idkit::crypto::hash_signal(
            &idkit::types::Signal::from_bytes(data),
        )))
    })
}

/// Builds the plaintext bridge request payload for a preset without any
/// network I/O (test fixtures / debugging). ok: the payload JSON object.
///
/// # Safety
///
/// Both arguments must be null or valid NUL-terminated UTF-8 strings.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_bridge_payload_from_preset(
    config_json: *const c_char,
    preset_json: *const c_char,
) -> *mut c_char {
    ffi_boundary(|| {
        let config: config::RequestConfigDto =
            parse_json(read_str(config_json, "config_json")?, "config_json")?;
        let preset: idkit::Preset =
            parse_json(read_str(preset_json, "preset_json")?, "preset_json")?;
        let params = config.into_params_with_preset(preset)?;
        idkit::bridge::build_request_payload_json(&params, false).map_err(FfiError::Core)
    })
}

/// Builds the plaintext bridge request payload for a constraint tree without
/// any network I/O. ok: the payload JSON object.
///
/// # Safety
///
/// Both arguments must be null or valid NUL-terminated UTF-8 strings.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_bridge_payload_from_constraints(
    config_json: *const c_char,
    constraints_json: *const c_char,
) -> *mut c_char {
    ffi_boundary(|| {
        let config: config::RequestConfigDto =
            parse_json(read_str(config_json, "config_json")?, "config_json")?;
        let constraints: idkit::ConstraintNode = parse_json(
            read_str(constraints_json, "constraints_json")?,
            "constraints_json",
        )?;
        let params = config.into_params_with_constraints(constraints)?;
        idkit::bridge::build_request_payload_json(&params, false).map_err(FfiError::Core)
    })
}

/// Creates a bridge request from a preset. BLOCKING network call — dispatch
/// off the main thread. ok: `{"handle": u64, "connect_url": "...", "request_id": "..."}`.
///
/// # Safety
///
/// Both arguments must be null or valid NUL-terminated UTF-8 strings.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_request_create_with_preset(
    config_json: *const c_char,
    preset_json: *const c_char,
) -> *mut c_char {
    ffi_boundary(|| {
        let config: config::RequestConfigDto =
            parse_json(read_str(config_json, "config_json")?, "config_json")?;
        let preset: idkit::Preset =
            parse_json(read_str(preset_json, "preset_json")?, "preset_json")?;
        let mode = config.connect_url_mode();
        let params = config.into_params_with_preset(preset)?;
        create_request(params, mode)
    })
}

/// Creates a bridge request from a constraint tree. BLOCKING network call —
/// dispatch off the main thread. ok: same shape as the preset variant.
///
/// # Safety
///
/// Both arguments must be null or valid NUL-terminated UTF-8 strings.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_request_create_with_constraints(
    config_json: *const c_char,
    constraints_json: *const c_char,
) -> *mut c_char {
    ffi_boundary(|| {
        let config: config::RequestConfigDto =
            parse_json(read_str(config_json, "config_json")?, "config_json")?;
        let constraints: idkit::ConstraintNode = parse_json(
            read_str(constraints_json, "constraints_json")?,
            "constraints_json",
        )?;
        let mode = config.connect_url_mode();
        let params = config.into_params_with_constraints(constraints)?;
        create_request(params, mode)
    })
}

/// Polls the request once. BLOCKING network call — dispatch off the main thread.
///
/// ok is one of:
/// - `{"state": "waiting_for_connection"}` | `{"state": "awaiting_confirmation"}`
/// - `{"state": "confirmed", "result": { ...IDKitResult... }}`
/// - `{"state": "failed", "error_code": "user_rejected"}` (terminal)
/// - `{"state": "networking_error", "error_code": "connection_failed"}` (retryable)
///
/// err only for `invalid_handle` / internal failures.
#[no_mangle]
pub extern "C" fn idkit_kmp_request_poll_once(handle: u64) -> *mut c_char {
    ffi_boundary(|| {
        // Arc clone — the registry lock is not held during network I/O.
        let entry = registry::request_entry(handle)?;
        let value = match block_on_bridge(entry.conn.poll_for_status()) {
            Ok(idkit::Status::WaitingForConnection) => {
                serde_json::json!({ "state": "waiting_for_connection" })
            }
            Ok(idkit::Status::AwaitingConfirmation) => {
                serde_json::json!({ "state": "awaiting_confirmation" })
            }
            Ok(idkit::Status::Confirmed(result)) => serde_json::json!({
                "state": "confirmed",
                "result": serde_json::to_value(&result)
                    .map_err(|error| FfiError::Runtime(format!("result serialization: {error}")))?,
            }),
            Ok(idkit::Status::Failed(app_error)) => serde_json::json!({
                "state": "failed",
                "error_code": envelope::app_error_code(app_error),
            }),
            Err(FfiError::Core(error)) => {
                // Mirrors the UniFFI StatusWrapper semantics: transport-level
                // failures are retryable, everything else is terminal.
                let state = if idkit::bridge::is_networking_error(&error) {
                    "networking_error"
                } else {
                    "failed"
                };
                serde_json::json!({
                    "state": state,
                    "error_code": envelope::app_error_code(idkit::bridge::to_app_error(&error)),
                })
            }
            Err(other) => return Err(other),
        };
        Ok(value)
    })
}

/// Releases the request handle. Idempotent; unknown handles are ignored.
#[no_mangle]
pub extern "C" fn idkit_kmp_request_free(handle: u64) {
    registry::remove_request(handle);
}

/// Frees a string previously returned by any `idkit_kmp_*` function.
/// Passing null is a no-op.
///
/// # Safety
///
/// `ptr` must be null or a pointer previously returned by this library that
/// has not already been freed.
#[no_mangle]
pub unsafe extern "C" fn idkit_kmp_string_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(CString::from_raw(ptr));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffi_boundary_converts_panics_to_envelopes() {
        let ptr = ffi_boundary(|| panic!("boom"));
        let json = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned();
        unsafe { idkit_kmp_string_free(ptr) };
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["err"]["code"], "internal_panic");
        assert_eq!(value["err"]["message"], "boom");
    }
}
