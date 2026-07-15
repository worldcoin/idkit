package com.worldcoin.idkit.internal

import com.sun.jna.Native
import com.sun.jna.Pointer

/**
 * JNA direct mapping of the `idkit_kmp` C ABI (`libidkit_kmp.so` from the AAR's
 * jniLibs, or the host library via `-Djna.library.path` in unit tests).
 */
internal actual object NativeBridge {

    private object C {
        init {
            // Deterministic const char* marshalling regardless of host defaults.
            System.setProperty("jna.encoding", "UTF-8")
            try {
                Native.register(C::class.java, "idkit_kmp")
            } catch (error: UnsatisfiedLinkError) {
                throw UnsatisfiedLinkError(
                    "libidkit_kmp could not be loaded. Run `bash scripts/build-kotlin.sh` from the " +
                        "repository root to build the native artifacts (host unit tests also need " +
                        "-Djna.library.path=<repo>/target/release). Cause: ${error.message}",
                )
            }
        }

        // Returns are Pointer (not String) so the Rust allocation can be freed.
        @JvmStatic external fun idkit_kmp_version(): Pointer?
        @JvmStatic external fun idkit_kmp_hash_signal_string(signal: String): Pointer?
        @JvmStatic external fun idkit_kmp_hash_signal_bytes(bytes: ByteArray?, len: Long): Pointer?
        @JvmStatic external fun idkit_kmp_bridge_payload_from_preset(
            configJson: String,
            presetJson: String,
        ): Pointer?

        @JvmStatic external fun idkit_kmp_bridge_payload_from_constraints(
            configJson: String,
            constraintsJson: String,
        ): Pointer?

        @JvmStatic external fun idkit_kmp_request_create_with_preset(
            configJson: String,
            presetJson: String,
        ): Pointer?

        @JvmStatic external fun idkit_kmp_request_create_with_constraints(
            configJson: String,
            constraintsJson: String,
        ): Pointer?

        @JvmStatic external fun idkit_kmp_request_poll_once(handle: Long): Pointer?
        @JvmStatic external fun idkit_kmp_request_free(handle: Long)
        @JvmStatic external fun idkit_kmp_string_free(ptr: Pointer?)
    }

    /** Copies the envelope out of native memory and frees the Rust allocation. */
    private fun consume(ptr: Pointer?): String {
        checkNotNull(ptr) { "idkit_kmp returned NULL (allocator failure)" }
        try {
            return ptr.getString(0, "UTF-8")
        } finally {
            C.idkit_kmp_string_free(ptr)
        }
    }

    actual fun version(): String = consume(C.idkit_kmp_version())

    actual fun hashSignalString(signal: String): String =
        consume(C.idkit_kmp_hash_signal_string(signal))

    actual fun hashSignalBytes(bytes: ByteArray): String =
        consume(C.idkit_kmp_hash_signal_bytes(bytes, bytes.size.toLong()))

    actual fun bridgePayloadFromPreset(configJson: String, presetJson: String): String =
        consume(C.idkit_kmp_bridge_payload_from_preset(configJson, presetJson))

    actual fun bridgePayloadFromConstraints(configJson: String, constraintsJson: String): String =
        consume(C.idkit_kmp_bridge_payload_from_constraints(configJson, constraintsJson))

    actual fun requestCreateWithPreset(configJson: String, presetJson: String): String =
        consume(C.idkit_kmp_request_create_with_preset(configJson, presetJson))

    actual fun requestCreateWithConstraints(configJson: String, constraintsJson: String): String =
        consume(C.idkit_kmp_request_create_with_constraints(configJson, constraintsJson))

    actual fun requestPollOnce(handle: Long): String =
        consume(C.idkit_kmp_request_poll_once(handle))

    actual fun requestFree(handle: Long) {
        C.idkit_kmp_request_free(handle)
    }
}
