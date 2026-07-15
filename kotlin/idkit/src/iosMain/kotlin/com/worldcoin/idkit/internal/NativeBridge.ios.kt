package com.worldcoin.idkit.internal

import com.worldcoin.idkit.cinterop.idkit_kmp_bridge_payload_from_constraints
import com.worldcoin.idkit.cinterop.idkit_kmp_bridge_payload_from_preset
import com.worldcoin.idkit.cinterop.idkit_kmp_hash_signal_bytes
import com.worldcoin.idkit.cinterop.idkit_kmp_hash_signal_string
import com.worldcoin.idkit.cinterop.idkit_kmp_request_create_with_constraints
import com.worldcoin.idkit.cinterop.idkit_kmp_request_create_with_preset
import com.worldcoin.idkit.cinterop.idkit_kmp_request_free
import com.worldcoin.idkit.cinterop.idkit_kmp_request_poll_once
import com.worldcoin.idkit.cinterop.idkit_kmp_string_free
import com.worldcoin.idkit.cinterop.idkit_kmp_version
import kotlinx.cinterop.ByteVar
import kotlinx.cinterop.CPointer
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.toKString
import kotlinx.cinterop.usePinned

/**
 * Kotlin/Native cinterop binding of the `idkit_kmp` C ABI (`libidkit_kmp.a`,
 * statically linked into the framework via the cinterop klib).
 */
@OptIn(ExperimentalForeignApi::class)
internal actual object NativeBridge {

    /** Copies the envelope out of native memory and frees the Rust allocation. */
    private fun consume(ptr: CPointer<ByteVar>?): String {
        checkNotNull(ptr) { "idkit_kmp returned NULL (allocator failure)" }
        try {
            return ptr.toKString()
        } finally {
            idkit_kmp_string_free(ptr)
        }
    }

    actual fun version(): String = consume(idkit_kmp_version())

    actual fun hashSignalString(signal: String): String =
        consume(idkit_kmp_hash_signal_string(signal))

    actual fun hashSignalBytes(bytes: ByteArray): String =
        if (bytes.isEmpty()) {
            consume(idkit_kmp_hash_signal_bytes(null, 0u))
        } else {
            bytes.usePinned { pinned ->
                consume(
                    idkit_kmp_hash_signal_bytes(
                        pinned.addressOf(0).reinterpret(),
                        bytes.size.toULong(),
                    ),
                )
            }
        }

    actual fun bridgePayloadFromPreset(configJson: String, presetJson: String): String =
        consume(idkit_kmp_bridge_payload_from_preset(configJson, presetJson))

    actual fun bridgePayloadFromConstraints(configJson: String, constraintsJson: String): String =
        consume(idkit_kmp_bridge_payload_from_constraints(configJson, constraintsJson))

    actual fun requestCreateWithPreset(configJson: String, presetJson: String): String =
        consume(idkit_kmp_request_create_with_preset(configJson, presetJson))

    actual fun requestCreateWithConstraints(configJson: String, constraintsJson: String): String =
        consume(idkit_kmp_request_create_with_constraints(configJson, constraintsJson))

    actual fun requestPollOnce(handle: Long): String =
        consume(idkit_kmp_request_poll_once(handle.toULong()))

    actual fun requestFree(handle: Long) {
        idkit_kmp_request_free(handle.toULong())
    }
}
