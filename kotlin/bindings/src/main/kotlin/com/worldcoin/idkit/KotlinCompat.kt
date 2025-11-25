package com.worldcoin.idkit

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import uniffi.idkit.CredentialType
import uniffi.idkit.Request
import uniffi.idkit.Session
import uniffi.idkit.Signal
import uniffi.idkit.Status

fun Request(
    credentialType: CredentialType,
    signal: String? = null,
    faceAuth: Boolean? = null,
): Request {
    val signalObj = signal?.let { Signal.fromString(it) }
    val base = Request(credentialType, signalObj)
    return faceAuth?.let { base.withFaceAuth(it) } ?: base
}

fun Request(
    credentialType: CredentialType,
    abiEncodedSignal: ByteArray,
    faceAuth: Boolean? = null,
): Request {
    val signalObj = Signal.fromAbiEncoded(abiEncodedSignal)
    val base = Request(credentialType, signalObj)
    return faceAuth?.let { base.withFaceAuth(it) } ?: base
}

val Signal.data: ByteArray
    get() = this.asBytes()

val Signal.string: String?
    get() = this.asString()

/**
 * Flow-based status helper.
 *
 * @param pollInterval How long to wait between polls.
 */
fun Session.statusFlow(pollInterval: Duration = 3.seconds): Flow<Status> = flow {
    var last: Status? = null

    while (true) {
        val current = pollForStatus()
        if (current != last) {
            last = current
            emit(current)
        }

        when (current) {
            is Status.Confirmed,
            is Status.Failed -> return@flow
            Status.AwaitingConfirmation,
            Status.WaitingForConnection -> {
                delay(pollInterval)
            }
        }
    }
}
