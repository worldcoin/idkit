package com.worldcoin.idkit

import com.worldcoin.idkit.internal.IdKitJson
import com.worldcoin.idkit.internal.NativeBridge
import com.worldcoin.idkit.internal.unwrapEnvelope
import kotlinx.coroutines.CancellationException
import com.worldcoin.idkit.internal.ioDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlin.coroutines.coroutineContext
import kotlin.time.TimeSource

@Serializable
internal data class StatusDto(
    val state: String,
    val result: JsonObject? = null,
    @SerialName("error_code") val errorCode: String? = null,
)

internal fun mapStatusDto(dto: StatusDto): IDKitStatus = when (dto.state) {
    "waiting_for_connection" -> IDKitStatus.WaitingForConnection
    "awaiting_confirmation" -> IDKitStatus.AwaitingConfirmation
    "confirmed" -> {
        val result = dto.result
            ?: throw IDKitException("unexpected_response", "confirmed status is missing its result")
        IDKitStatus.Confirmed(
            IDKitResult.fromJson(IdKitJson.encodeToString(JsonObject.serializer(), result)),
        )
    }
    "failed" -> IDKitStatus.Failed(IDKitErrorCode.from(dto.errorCode ?: "generic_error"))
    "networking_error" ->
        IDKitStatus.NetworkingError(IDKitErrorCode.from(dto.errorCode ?: "connection_failed"))
    else -> throw IDKitException("unexpected_response", "unknown status state: ${dto.state}")
}

/**
 * Builder returned by [IDKit.request]. Terminal calls ([preset] / [constraints])
 * open the bridge connection over the network and therefore suspend; the
 * blocking FFI call runs on [ioDispatcher].
 */
public class IDKitBuilder internal constructor(
    private val configJson: String,
) {
    /** Creates a bridge request from a [Preset]. */
    public suspend fun preset(preset: Preset): IDKitRequest = createRequest(
        payloadJson = IdKitJson.encodeToString(Preset.serializer(), preset),
        create = NativeBridge::requestCreateWithPreset,
    )

    /** Creates a bridge request from a [ConstraintNode] tree. */
    public suspend fun constraints(constraints: ConstraintNode): IDKitRequest = createRequest(
        payloadJson = IdKitJson.encodeToString(ConstraintNode.serializer(), constraints),
        create = NativeBridge::requestCreateWithConstraints,
    )

    private suspend fun createRequest(
        payloadJson: String,
        create: (configJson: String, payloadJson: String) -> String,
    ): IDKitRequest = withContext(ioDispatcher) {
        val ok = unwrapEnvelope(create(configJson, payloadJson)).jsonObject
        IDKitRequest(
            connectorUri = ok["connect_url"]?.jsonPrimitive?.content
                ?: throw IDKitException("unexpected_response", "create response is missing connect_url"),
            requestId = ok["request_id"]?.jsonPrimitive?.content
                ?: throw IDKitException("unexpected_response", "create response is missing request_id"),
            handle = ok["handle"]?.jsonPrimitive?.long
                ?: throw IDKitException("unexpected_response", "create response is missing handle"),
        )
    }
}

/** An in-flight verification request. */
public class IDKitRequest internal constructor(
    private val connectorUriValue: String,
    private val requestIdValue: String,
    private val handle: Long?,
    private val pollStatusProvider: suspend () -> IDKitStatus,
) {
    internal constructor(connectorUri: String, requestId: String, handle: Long) : this(
        connectorUriValue = connectorUri,
        requestIdValue = requestId,
        handle = handle,
        pollStatusProvider = {
            withContext(ioDispatcher) {
                val ok = unwrapEnvelope(NativeBridge.requestPollOnce(handle))
                mapStatusDto(IdKitJson.decodeFromJsonElement(StatusDto.serializer(), ok))
            }
        },
    )

    /** Deep link that opens World App (or the QR-code payload). */
    public val connectorURI: String
        get() = connectorUriValue

    /** Bridge request identifier. */
    public val requestId: String
        get() = requestIdValue

    private var closed: Boolean = false

    /** Polls the bridge once for the current status. */
    public suspend fun pollStatusOnce(): IDKitStatus = pollStatusProvider()

    /**
     * Polls until the request reaches a terminal state.
     *
     * Networking errors are retried silently; the wall-clock deadline yields
     * [IDKitErrorCode.TIMEOUT] and coroutine cancellation yields
     * [IDKitErrorCode.CANCELLED] — identical semantics to the Kotlin and Swift SDKs.
     */
    public suspend fun pollUntilCompletion(
        options: IDKitPollOptions = IDKitPollOptions(),
    ): IDKitCompletionResult {
        val pollIntervalMs = options.pollIntervalMs.coerceAtLeast(1u)
        val startedAt = TimeSource.Monotonic.markNow()

        try {
            while (true) {
                coroutineContext.ensureActive()

                if (startedAt.elapsedNow().inWholeMilliseconds.toULong() >= options.timeoutMs) {
                    return IDKitCompletionResult.Failure(IDKitErrorCode.TIMEOUT)
                }

                when (val status = pollStatusOnce()) {
                    is IDKitStatus.Confirmed -> return IDKitCompletionResult.Success(status.result)
                    is IDKitStatus.Failed -> return IDKitCompletionResult.Failure(status.error)
                    is IDKitStatus.NetworkingError -> delay(pollIntervalMs.toLong())
                    IDKitStatus.AwaitingConfirmation,
                    IDKitStatus.WaitingForConnection,
                    -> delay(pollIntervalMs.toLong())
                }
            }
        } catch (_: CancellationException) {
            return IDKitCompletionResult.Failure(IDKitErrorCode.CANCELLED)
        }
    }

    /**
     * Releases the native request handle. Call when done with the request;
     * polling after close reports an `invalid_handle` [IDKitException].
     * Safe to call more than once.
     */
    public fun close() {
        if (!closed) {
            closed = true
            handle?.let { NativeBridge.requestFree(it) }
        }
    }

    internal companion object {
        internal fun forTesting(
            connectorURI: String,
            requestId: String,
            pollStatusProvider: suspend () -> IDKitStatus,
        ): IDKitRequest = IDKitRequest(connectorURI, requestId, null, pollStatusProvider)
    }
}

/**
 * Flow-based status helper for [IDKitRequest]. Emits on every distinct status
 * (networking errors are silently retried, consistent with
 * [IDKitRequest.pollUntilCompletion]) and completes on a terminal status.
 */
public fun IDKitRequest.statusFlow(pollIntervalMs: ULong = 3_000u): Flow<IDKitStatus> = flow {
    var last: IDKitStatus? = null

    while (true) {
        val current = pollStatusOnce()
        if (current != last && current !is IDKitStatus.NetworkingError) {
            last = current
            emit(current)
        }

        when (current) {
            is IDKitStatus.Confirmed,
            is IDKitStatus.Failed,
            -> return@flow
            is IDKitStatus.NetworkingError,
            IDKitStatus.AwaitingConfirmation,
            IDKitStatus.WaitingForConnection,
            -> delay(pollIntervalMs.toLong())
        }
    }
}
