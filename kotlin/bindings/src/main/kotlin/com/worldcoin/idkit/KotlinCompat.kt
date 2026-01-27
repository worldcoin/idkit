package com.worldcoin.idkit

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import uniffi.idkit_core.CredentialRequest
import uniffi.idkit_core.SessionWrapper
import uniffi.idkit_core.Signal
import uniffi.idkit_core.StatusWrapper
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.IdkitResult
import uniffi.idkit_core.IdkitResponseItem
import uniffi.idkit_core.ProofData

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
// ProofData Extensions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if this is a V4 proof.
 */
val ProofData.isV4: Boolean
    get() = this is ProofData.V4

/**
 * Returns true if this is a Legacy proof.
 */
val ProofData.isLegacy: Boolean
    get() = this is ProofData.Legacy

/**
 * Gets the nullifier value regardless of proof type.
 */
val ProofData.nullifier: String
    get() = when (this) {
        is ProofData.V4 -> this.nullifier
        is ProofData.Legacy -> this.nullifierHash
    }

/**
 * Gets the merkle root regardless of proof type.
 */
val ProofData.merkleRoot: String
    get() = when (this) {
        is ProofData.V4 -> this.merkleRoot
        is ProofData.Legacy -> this.merkleRoot
    }

/**
 * Gets the proof string regardless of proof type.
 */
val ProofData.proof: String
    get() = when (this) {
        is ProofData.V4 -> this.proof
        is ProofData.Legacy -> this.proof
    }

// ─────────────────────────────────────────────────────────────────────────────
// IDKitResponseItem Extensions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if this response indicates success.
 */
val IdkitResponseItem.isSuccess: Boolean
    get() = this.proofData != null

/**
 * Returns true if this response indicates an error.
 */
val IdkitResponseItem.isError: Boolean
    get() = this.error != null

// ─────────────────────────────────────────────────────────────────────────────
// IDKitResult Extensions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the first successful response item, if any.
 */
fun IdkitResult.firstSuccessful(): IdkitResponseItem? =
    responses.firstOrNull { it.isSuccess }

/**
 * Returns all successful response items.
 */
fun IdkitResult.allSuccessful(): List<IdkitResponseItem> =
    responses.filter { it.isSuccess }

/**
 * Returns true if all responses are successful.
 */
fun IdkitResult.isAllSuccessful(): Boolean =
    responses.isNotEmpty() && responses.all { it.isSuccess }

/**
 * Returns true if at least one response is successful.
 */
fun IdkitResult.hasAnySuccessful(): Boolean =
    responses.any { it.isSuccess }

/**
 * Returns the count of successful responses.
 */
fun IdkitResult.successCount(): Int =
    responses.count { it.isSuccess }

/**
 * Returns the count of failed responses.
 */
fun IdkitResult.failureCount(): Int =
    responses.count { it.isError }

// ─────────────────────────────────────────────────────────────────────────────
// StatusWrapper Extensions
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Convenience accessor for the IDKitResult when status is Confirmed.
 */
val StatusWrapper.Confirmed.idkitResult: IdkitResult
    get() = this.result
