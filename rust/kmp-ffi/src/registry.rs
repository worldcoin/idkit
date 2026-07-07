//! Handle registry and shared async runtime.
//!
//! Requests cross the FFI as opaque `u64` handles rather than raw pointers so
//! that stale or double frees are safe no-ops instead of undefined behavior.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex, MutexGuard, PoisonError};

use crate::envelope::FfiError;

pub(crate) struct RequestEntry {
    pub(crate) conn: idkit::BridgeConnection,
}

static NEXT_HANDLE: AtomicU64 = AtomicU64::new(1);

static REGISTRY: LazyLock<Mutex<HashMap<u64, Arc<RequestEntry>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// One bounded runtime shared by all requests. (The UniFFI wrappers build a
// runtime per request; sharing a single single-threaded runtime here avoids
// unbounded thread growth when many requests are alive at once.) A build
// failure is reported as an error envelope, never a panic.
static RUNTIME: LazyLock<Result<tokio::runtime::Runtime, String>> = LazyLock::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .thread_name("idkit-kmp")
        .enable_all()
        .build()
        .map_err(|error| format!("failed to build tokio runtime: {error}"))
});

pub(crate) fn runtime() -> Result<&'static tokio::runtime::Runtime, FfiError> {
    RUNTIME
        .as_ref()
        .map_err(|error| FfiError::Runtime(error.clone()))
}

fn registry() -> MutexGuard<'static, HashMap<u64, Arc<RequestEntry>>> {
    // A panic while holding the lock is already converted to an envelope by
    // ffi_boundary; recover the map instead of poisoning every later call.
    REGISTRY.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(crate) fn insert_request(conn: idkit::BridgeConnection) -> u64 {
    let handle = NEXT_HANDLE.fetch_add(1, Ordering::Relaxed);
    registry().insert(handle, Arc::new(RequestEntry { conn }));
    handle
}

/// Clones the entry out so the registry lock is never held across network I/O.
pub(crate) fn request_entry(handle: u64) -> Result<Arc<RequestEntry>, FfiError> {
    registry()
        .get(&handle)
        .cloned()
        .ok_or(FfiError::InvalidHandle(handle))
}

pub(crate) fn remove_request(handle: u64) {
    registry().remove(&handle);
}
