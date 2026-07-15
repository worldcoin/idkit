#ifndef IDKIT_KMP_H
#define IDKIT_KMP_H

/*
 * C ABI for the IDKit Kotlin Multiplatform SDK.
 *
 * Hand-written facade over the Rust core (rust/kmp-ffi). Consumed by:
 *   - Kotlin/Native (iOS) via cinterop
 *   - Kotlin/JVM (Android) via JNA direct mapping
 *
 * Contract:
 *   - Every function returns a heap-allocated, NUL-terminated UTF-8 JSON
 *     envelope: {"ok": <value>} or {"err": {"code": "...", "message": "..."}}.
 *     The caller MUST free every returned pointer with idkit_kmp_string_free.
 *   - All char* inputs are NUL-terminated UTF-8. Null/invalid inputs yield an
 *     {"err": {"code": "invalid_argument", ...}} envelope, never a crash.
 *   - Panics never unwind across this boundary; they become
 *     {"err": {"code": "internal_panic", ...}} envelopes.
 *   - Functions marked BLOCKING perform network I/O with a bounded (30s)
 *     deadline and must be called off the main thread.
 */

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ok: crate version string, e.g. "4.0.0". */
char *idkit_kmp_version(void);

/* ok: "0x"-prefixed field-element hex. Strings use IDKit hashSignal semantics:
 * a valid non-empty even-length 0x-hex string is hashed as raw bytes, any
 * other string as UTF-8 text. For signals with interior NUL bytes use the
 * bytes variant. */
char *idkit_kmp_hash_signal_string(const char *signal);

/* bytes may be NULL iff len == 0. */
char *idkit_kmp_hash_signal_bytes(const uint8_t *bytes, uint64_t len);

/* Build the plaintext bridge request payload without network I/O (test
 * fixtures / debugging).
 *   config_json:      RequestConfigDto (see rust/kmp-ffi/src/config.rs)
 *   preset_json:      core Preset serde form, e.g. {"type":"OrbLegacy","signal":"..."}
 *   constraints_json: core ConstraintNode serde form, e.g. {"any":[{"type":"passport"}]}
 * ok: the payload JSON object. */
char *idkit_kmp_bridge_payload_from_preset(const char *config_json,
                                           const char *preset_json);
char *idkit_kmp_bridge_payload_from_constraints(const char *config_json,
                                                const char *constraints_json);

/* BLOCKING (POST /request to the bridge).
 * ok: {"handle": <u64>, "connect_url": "...", "request_id": "..."} */
char *idkit_kmp_request_create_with_preset(const char *config_json,
                                           const char *preset_json);
char *idkit_kmp_request_create_with_constraints(const char *config_json,
                                                const char *constraints_json);

/* BLOCKING (GET /response from the bridge). ok is one of:
 *   {"state":"waiting_for_connection"} | {"state":"awaiting_confirmation"}
 *   {"state":"confirmed","result":{...IDKitResult...}}
 *   {"state":"failed","error_code":"user_rejected"}            (terminal)
 *   {"state":"networking_error","error_code":"connection_failed"} (retryable)
 * err only for invalid_handle / internal failures. */
char *idkit_kmp_request_poll_once(uint64_t handle);

/* Releases the request. Idempotent; unknown handles are ignored. */
void idkit_kmp_request_free(uint64_t handle);

/* Frees a string returned by any idkit_kmp_* function. NULL is a no-op. */
void idkit_kmp_string_free(char *ptr);

#ifdef __cplusplus
}
#endif

#endif /* IDKIT_KMP_H */
