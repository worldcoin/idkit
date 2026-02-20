package com.worldcoin.idkit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlin.coroutines.coroutineContext
import uniffi.idkit_core.AppError
import uniffi.idkit_core.ConstraintNode
import uniffi.idkit_core.CredentialRequest
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.IdKitBuilder
import uniffi.idkit_core.IdKitRequestConfig
import uniffi.idkit_core.IdKitRequestWrapper
import uniffi.idkit_core.IdKitResult
import uniffi.idkit_core.IdKitSessionConfig
import uniffi.idkit_core.Preset
import uniffi.idkit_core.Signal
import uniffi.idkit_core.StatusWrapper
import uniffi.idkit_core.createSession as nativeCreateSession
import uniffi.idkit_core.credentialToString
import uniffi.idkit_core.hashSignalFfi
import uniffi.idkit_core.idkitResultFromJson as nativeIdkitResultFromJson
import uniffi.idkit_core.idkitResultToJson as nativeIdkitResultToJson
import uniffi.idkit_core.proveSession as nativeProveSession
import uniffi.idkit_core.request as nativeRequest

typealias IDKitRequestConfig = IdKitRequestConfig
typealias IDKitSessionConfig = IdKitSessionConfig
typealias IDKitResult = IdKitResult

class IDKitClientError(message: String) : IllegalArgumentException(message)

enum class IDKitErrorCode(val rawValue: String) {
    USER_REJECTED("user_rejected"),
    VERIFICATION_REJECTED("verification_rejected"),
    CREDENTIAL_UNAVAILABLE("credential_unavailable"),
    MALFORMED_REQUEST("malformed_request"),
    INVALID_NETWORK("invalid_network"),
    INCLUSION_PROOF_PENDING("inclusion_proof_pending"),
    INCLUSION_PROOF_FAILED("inclusion_proof_failed"),
    UNEXPECTED_RESPONSE("unexpected_response"),
    CONNECTION_FAILED("connection_failed"),
    MAX_VERIFICATIONS_REACHED("max_verifications_reached"),
    FAILED_BY_HOST_APP("failed_by_host_app"),
    GENERIC_ERROR("generic_error"),
    TIMEOUT("timeout"),
    CANCELLED("cancelled");

    internal companion object {
        fun from(error: AppError): IDKitErrorCode = when (error) {
            AppError.USER_REJECTED -> USER_REJECTED
            AppError.VERIFICATION_REJECTED -> VERIFICATION_REJECTED
            AppError.CREDENTIAL_UNAVAILABLE -> CREDENTIAL_UNAVAILABLE
            AppError.MALFORMED_REQUEST -> MALFORMED_REQUEST
            AppError.INVALID_NETWORK -> INVALID_NETWORK
            AppError.INCLUSION_PROOF_PENDING -> INCLUSION_PROOF_PENDING
            AppError.INCLUSION_PROOF_FAILED -> INCLUSION_PROOF_FAILED
            AppError.UNEXPECTED_RESPONSE -> UNEXPECTED_RESPONSE
            AppError.CONNECTION_FAILED -> CONNECTION_FAILED
            AppError.MAX_VERIFICATIONS_REACHED -> MAX_VERIFICATIONS_REACHED
            AppError.FAILED_BY_HOST_APP -> FAILED_BY_HOST_APP
            AppError.GENERIC_ERROR -> GENERIC_ERROR
        }
    }
}

sealed interface IDKitStatus {
    data object WaitingForConnection : IDKitStatus
    data object AwaitingConfirmation : IDKitStatus
    data class Confirmed(val result: IDKitResult) : IDKitStatus
    data class Failed(val error: IDKitErrorCode) : IDKitStatus
}

sealed interface IDKitCompletionResult {
    data class Success(val result: IDKitResult) : IDKitCompletionResult
    data class Failure(val error: IDKitErrorCode) : IDKitCompletionResult
}

data class IDKitPollOptions(
    val pollIntervalMs: ULong = 1_000u,
    val timeoutMs: ULong = 300_000u,
)

data class CredentialRequestOptions(
    val signal: String? = null,
    val genesisIssuedAtMin: ULong? = null,
    val expiresAtMin: ULong? = null,
)

class IDKitBuilder internal constructor(
    private val inner: IdKitBuilder,
) {
    fun constraints(constraints: ConstraintNode): IDKitRequest =
        IDKitRequest(inner.constraints(constraints))

    fun preset(preset: Preset): IDKitRequest =
        IDKitRequest(inner.preset(preset))
}

class IDKitRequest internal constructor(
    private val connectorUriValue: String,
    private val requestIdValue: String,
    private val pollStatusProvider: suspend () -> IDKitStatus,
) {
    internal constructor(inner: IdKitRequestWrapper) : this(
        connectorUriValue = inner.connectUrl(),
        requestIdValue = inner.requestId(),
        pollStatusProvider = { mapStatus(inner.pollStatusOnce()) },
    )

    val connectorURI: String
        get() = connectorUriValue

    val requestId: String
        get() = requestIdValue

    suspend fun pollStatusOnce(): IDKitStatus = pollStatusProvider()

    suspend fun pollUntilCompletion(
        options: IDKitPollOptions = IDKitPollOptions(),
    ): IDKitCompletionResult {
        val pollIntervalMs = options.pollIntervalMs.coerceAtLeast(1u)
        val startedAt = System.currentTimeMillis()

        try {
            while (true) {
                coroutineContext.ensureActive()

                if (System.currentTimeMillis() - startedAt >= options.timeoutMs.toLong()) {
                    return IDKitCompletionResult.Failure(IDKitErrorCode.TIMEOUT)
                }

                when (val status = pollStatusOnce()) {
                    is IDKitStatus.Confirmed -> return IDKitCompletionResult.Success(status.result)
                    is IDKitStatus.Failed -> return IDKitCompletionResult.Failure(status.error)
                    IDKitStatus.AwaitingConfirmation,
                    IDKitStatus.WaitingForConnection -> delay(pollIntervalMs.toLong())
                }
            }
        } catch (_: CancellationException) {
            return IDKitCompletionResult.Failure(IDKitErrorCode.CANCELLED)
        }
    }

    internal companion object {
        internal fun forTesting(
            connectorURI: String,
            requestId: String,
            pollStatusProvider: suspend () -> IDKitStatus,
        ): IDKitRequest = IDKitRequest(connectorURI, requestId, pollStatusProvider)

        internal fun mapStatus(status: StatusWrapper): IDKitStatus = when (status) {
            StatusWrapper.WaitingForConnection -> IDKitStatus.WaitingForConnection
            StatusWrapper.AwaitingConfirmation -> IDKitStatus.AwaitingConfirmation
            is StatusWrapper.Confirmed -> IDKitStatus.Confirmed(status.result)
            is StatusWrapper.Failed -> IDKitStatus.Failed(IDKitErrorCode.from(status.error))
        }
    }
}

object IDKit {
    const val version: String = "4.0.0"

    fun request(config: IDKitRequestConfig): IDKitBuilder {
        require(config.appId.isNotBlank()) { "app_id is required" }
        require(config.action.isNotBlank()) { "action is required" }
        return IDKitBuilder(nativeRequest(config))
    }

    fun createSession(config: IDKitSessionConfig): IDKitBuilder {
        require(config.appId.isNotBlank()) { "app_id is required" }
        return IDKitBuilder(nativeCreateSession(config))
    }

    fun proveSession(sessionId: String, config: IDKitSessionConfig): IDKitBuilder {
        require(sessionId.isNotBlank()) { "session_id is required" }
        require(config.appId.isNotBlank()) { "app_id is required" }
        return IDKitBuilder(nativeProveSession(sessionId, config))
    }

    fun hashSignal(signal: String): String = hashSignalFfi(Signal.fromString(signal))

    fun hashSignal(signal: ByteArray): String = hashSignalFfi(Signal.fromBytes(signal))
}

private fun credentialRequestFromOptions(
    type: CredentialType,
    options: CredentialRequestOptions,
): CredentialRequest {
    val payload = buildJsonObject {
        put("type", JsonPrimitive(credentialToString(type)))
        options.signal?.let { put("signal", JsonPrimitive(it)) }
        options.genesisIssuedAtMin?.let { put("genesis_issued_at_min", JsonPrimitive(it.toLong())) }
        options.expiresAtMin?.let { put("expires_at_min", JsonPrimitive(it.toLong())) }
    }
    return CredentialRequest.fromJson(payload.toString())
}

fun CredentialRequest(type: CredentialType, signal: String? = null): CredentialRequest =
    CredentialRequest.withStringSignal(type, signal)

fun CredentialRequest(type: CredentialType, abiEncodedSignal: ByteArray): CredentialRequest =
    CredentialRequest(type, Signal.fromBytes(abiEncodedSignal))

fun CredentialRequest(type: CredentialType, options: CredentialRequestOptions): CredentialRequest {
    if (options.genesisIssuedAtMin == null && options.expiresAtMin == null) {
        return CredentialRequest.withStringSignal(type, options.signal)
    }

    if (options.expiresAtMin == null) {
        return CredentialRequest.withGenesisMin(type, options.signal?.let { Signal.fromString(it) }, options.genesisIssuedAtMin!!)
    }

    if (options.genesisIssuedAtMin == null) {
        return CredentialRequest.withExpiresAtMin(type, options.signal?.let { Signal.fromString(it) }, options.expiresAtMin)
    }

    return credentialRequestFromOptions(type, options)
}

fun anyOf(vararg items: CredentialRequest): ConstraintNode =
    ConstraintNode.any(items.map { ConstraintNode.item(it) })

fun anyOf(items: List<CredentialRequest>): ConstraintNode =
    ConstraintNode.any(items.map { ConstraintNode.item(it) })

fun anyOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
    ConstraintNode.any(nodes.toList())

fun anyOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
    ConstraintNode.any(nodes)

fun allOf(vararg items: CredentialRequest): ConstraintNode =
    ConstraintNode.all(items.map { ConstraintNode.item(it) })

fun allOf(items: List<CredentialRequest>): ConstraintNode =
    ConstraintNode.all(items.map { ConstraintNode.item(it) })

fun allOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
    ConstraintNode.all(nodes.toList())

fun allOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
    ConstraintNode.all(nodes)

fun enumerateOf(vararg items: CredentialRequest): ConstraintNode =
    enumerateOfNodes(items.map { ConstraintNode.item(it) })

fun enumerateOf(items: List<CredentialRequest>): ConstraintNode =
    enumerateOfNodes(items.map { ConstraintNode.item(it) })

fun enumerateOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
    enumerateOfNodes(nodes.toList())

fun enumerateOfNodes(nodes: List<ConstraintNode>): ConstraintNode {
    val nodesJson = nodes.joinToString(separator = ",") { it.toJson() }
    return ConstraintNode.fromJson("""{"enumerate":[${nodesJson}]}""")
}

fun orbLegacy(signal: String? = null): Preset = Preset.OrbLegacy(signal = signal)

fun secureDocumentLegacy(signal: String? = null): Preset =
    Preset.SecureDocumentLegacy(signal = signal)

fun documentLegacy(signal: String? = null): Preset = Preset.DocumentLegacy(signal = signal)

fun idkitResultToJson(result: IDKitResult): String = nativeIdkitResultToJson(result)

fun idkitResultFromJson(json: String): IDKitResult = nativeIdkitResultFromJson(json)

fun hashSignal(signal: Signal): String = hashSignalFfi(signal)
