package com.worldcoin.idkit

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import uniffi.idkit_core.RequestItem
import uniffi.idkit_core.SessionWrapper
import uniffi.idkit_core.Signal
import uniffi.idkit_core.StatusWrapper
import uniffi.idkit_core.CredentialType

/**
 * Create a RequestItem from a credential type and optional signal string.
 */
fun RequestItem(
    credentialType: CredentialType,
    signal: String? = null,
): RequestItem {
    val signalObj = signal?.let { Signal.fromString(it) }
    return RequestItem.new(credentialType, signalObj)
}

/**
 * Create a RequestItem from a credential type and ABI-encoded signal bytes.
 */
fun RequestItem(
    credentialType: CredentialType,
    abiEncodedSignal: ByteArray,
): RequestItem {
    val signalObj = Signal.fromAbiEncoded(abiEncodedSignal)
    return RequestItem.new(credentialType, signalObj)
}

val Signal.data: ByteArray
    get() = this.asBytes()

val Signal.string: String?
    get() = this.asString()

/**
 * Flow-based status helper for SessionWrapper.
 *
 * @param pollInterval How long to wait between polls.
 */
fun SessionWrapper.statusFlow(pollInterval: Duration = 3.seconds): Flow<StatusWrapper> = flow {
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
