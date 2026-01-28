package com.worldcoin.idkit

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import uniffi.idkit_core.CredentialRequest
import uniffi.idkit_core.IdKitRequestWrapper
import uniffi.idkit_core.Signal
import uniffi.idkit_core.StatusWrapper
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.IdKitResult

// Type aliases for public API consistency - UniFFI 0.30 generates IdKit* names
typealias IDKitRequestWrapper = IdKitRequestWrapper
typealias IDKitResult = IdKitResult

/**
 * Create a CredentialRequest from a credential type and optional signal string.
 */
fun CredentialRequest(
    credentialType: CredentialType,
    signal: String? = null,
): CredentialRequest {
    val signalObj = signal?.let { Signal.fromString(it) }
    return CredentialRequest.new(credentialType, signalObj)
}

/**
 * Create a CredentialRequest from a credential type and ABI-encoded signal bytes.
 */
fun CredentialRequest(
    credentialType: CredentialType,
    abiEncodedSignal: ByteArray,
): CredentialRequest {
    val signalObj = Signal.fromAbiEncoded(abiEncodedSignal)
    return CredentialRequest.new(credentialType, signalObj)
}

val Signal.data: ByteArray
    get() = this.asBytes()

val Signal.string: String?
    get() = this.asString()

// ─────────────────────────────────────────────────────────────────────────────
// StatusWrapper Extensions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flow-based status helper for IDKitRequestWrapper.
 *
 * @param pollInterval How long to wait between polls.
 */
fun IDKitRequestWrapper.statusFlow(pollInterval: Duration = 3.seconds): Flow<StatusWrapper> = flow {
    var last: StatusWrapper? = null

    while (true) {
        val current = pollStatus(
            pollIntervalMs = pollInterval.inWholeMilliseconds.toULong(),
            timeoutMs = null
        )
        if (current != last) {
            last = current
            emit(current)
        }

        when (current) {
            is StatusWrapper.Confirmed,
            is StatusWrapper.Failed -> return@flow
            StatusWrapper.AwaitingConfirmation,
            StatusWrapper.WaitingForConnection -> {
                delay(pollInterval)
            }
        }
    }
}

/**
 * Convenience accessor for the IDKitResult when status is Confirmed.
 */
val StatusWrapper.Confirmed.idkitResult: IDKitResult
    get() = this.result
