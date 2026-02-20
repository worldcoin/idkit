package com.worldcoin.idkit

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import uniffi.idkit_core.Signal

val Signal.data: ByteArray
    get() = this.asBytes()

val Signal.string: String?
    get() = this.asString()

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Status Extensions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flow-based status helper for IDKitRequest.
 *
 * @param pollInterval How long to wait between polls.
 */
fun IDKitRequest.statusFlow(pollInterval: Duration = 3.seconds): Flow<IDKitStatus> = flow {
    var last: IDKitStatus? = null

    while (true) {
        val current = pollStatusOnce()
        if (current != last) {
            last = current
            emit(current)
        }

        when (current) {
            is IDKitStatus.Confirmed,
            is IDKitStatus.Failed -> return@flow
            IDKitStatus.AwaitingConfirmation,
            IDKitStatus.WaitingForConnection -> {
                delay(pollInterval)
            }
        }
    }
}

/**
 * Convenience accessor for the IDKitResult when status is Confirmed.
 */
val IDKitStatus.Confirmed.idkitResult: IDKitResult
    get() = this.result
