package com.worldcoin.idkit.internal

/**
 * Thin platform seam over the `idkit_kmp` C ABI (see `rust/kmp-ffi/include/idkit_kmp.h`).
 *
 * Every function returns the raw JSON envelope string (`{"ok": ...}` or
 * `{"err": {"code", "message"}}`); decoding happens once in [Envelope].
 * Functions backed by network I/O (`requestCreate*`, `requestPollOnce`) block
 * the calling thread — callers must dispatch them on [kotlinx.coroutines.Dispatchers.IO].
 */
internal expect object NativeBridge {
    fun version(): String
    fun hashSignalString(signal: String): String
    fun hashSignalBytes(bytes: ByteArray): String
    fun bridgePayloadFromPreset(configJson: String, presetJson: String): String
    fun bridgePayloadFromConstraints(configJson: String, constraintsJson: String): String
    fun requestCreateWithPreset(configJson: String, presetJson: String): String
    fun requestCreateWithConstraints(configJson: String, constraintsJson: String): String
    fun requestPollOnce(handle: Long): String
    fun requestFree(handle: Long)
}
