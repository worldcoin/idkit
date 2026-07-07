//! JSON envelope helpers shared by every exported function.
//!
//! Every FFI function returns `{"ok": <value>}` or `{"err": {"code", "message"}}`
//! so the Kotlin side has a single, uniform decode path and no failure is ever
//! silently swallowed at the boundary.

use std::any::Any;
use std::ffi::{c_char, CString};

/// Errors surfaced through the `{"err": ...}` envelope.
pub(crate) enum FfiError {
    /// Caller passed a null pointer or non-UTF-8 string.
    InvalidArgument(String),
    /// Caller passed JSON that failed to parse or validate.
    Json(String),
    /// Caller referenced a handle that does not exist (or was already freed).
    InvalidHandle(u64),
    /// The embedded async runtime could not be constructed.
    Runtime(String),
    /// An error propagated from idkit-core.
    Core(idkit::Error),
}

impl FfiError {
    pub(crate) fn code(&self) -> String {
        match self {
            Self::InvalidArgument(_) => "invalid_argument".to_owned(),
            Self::Json(_) => "invalid_json".to_owned(),
            Self::InvalidHandle(_) => "invalid_handle".to_owned(),
            Self::Runtime(_) => "internal_error".to_owned(),
            // Same code mapping as the UniFFI wrappers so all SDKs report
            // identical codes for the same underlying failure.
            Self::Core(error) => app_error_code(idkit::bridge::to_app_error(error)),
        }
    }

    pub(crate) fn message(&self) -> String {
        match self {
            Self::InvalidArgument(msg) | Self::Json(msg) | Self::Runtime(msg) => msg.clone(),
            Self::InvalidHandle(handle) => {
                format!("unknown request handle {handle} (already freed?)")
            }
            Self::Core(error) => error.to_string(),
        }
    }
}

impl From<idkit::Error> for FfiError {
    fn from(error: idkit::Error) -> Self {
        Self::Core(error)
    }
}

/// Wire code string for an [`idkit::error::AppError`] (its serde `snake_case` name).
pub(crate) fn app_error_code(error: idkit::error::AppError) -> String {
    serde_json::to_value(error)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| "generic_error".to_owned())
}

pub(crate) fn ok_cstring(value: &serde_json::Value) -> *mut c_char {
    into_cstring(&serde_json::json!({ "ok": value }))
}

pub(crate) fn err_cstring(code: &str, message: &str) -> *mut c_char {
    into_cstring(&serde_json::json!({ "err": { "code": code, "message": message } }))
}

fn into_cstring(value: &serde_json::Value) -> *mut c_char {
    let json = serde_json::to_string(value).unwrap_or_else(|_| {
        r#"{"err":{"code":"internal_error","message":"envelope serialization failed"}}"#.to_owned()
    });
    // serde_json escapes control characters (including NUL) so CString::new can
    // only fail on the fallback above — keep a hard static fallback regardless.
    CString::new(json)
        .unwrap_or_else(|_| {
            CString::new(
                r#"{"err":{"code":"internal_error","message":"embedded NUL in envelope"}}"#,
            )
            .expect("static fallback envelope contains no NUL")
        })
        .into_raw()
}

/// Best-effort extraction of a panic payload's message.
pub(crate) fn panic_message(payload: &(dyn Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| (*s).to_owned())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "panic with non-string payload".to_owned())
}
