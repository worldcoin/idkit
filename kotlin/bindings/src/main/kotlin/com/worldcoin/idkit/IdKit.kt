package com.worldcoin.idkit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
// TODO: Re-enable when World ID 4.0 is live
// import kotlinx.serialization.json.JsonPrimitive
// import kotlinx.serialization.json.buildJsonObject
import kotlin.coroutines.coroutineContext
import uniffi.idkit_core.AppError
// TODO: Re-enable when World ID 4.0 is live
// import uniffi.idkit_core.ConstraintNode
// import uniffi.idkit_core.CredentialRequest
// import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.IdKitBuilder
import uniffi.idkit_core.IdKitRequestConfig as NativeIDKitRequestConfig
import uniffi.idkit_core.IdKitRequestWrapper
import uniffi.idkit_core.IdKitResult
import uniffi.idkit_core.IdKitSessionConfig as NativeIDKitSessionConfig
import uniffi.idkit_core.Preset
import uniffi.idkit_core.Signal
import uniffi.idkit_core.StatusWrapper
// TODO: Re-enable when World ID 4.0 is live
// import uniffi.idkit_core.createSession as nativeCreateSession
// import uniffi.idkit_core.credentialToString
import uniffi.idkit_core.hashSignalFfi
import uniffi.idkit_core.idkitResultFromJson as nativeIdkitResultFromJson
import uniffi.idkit_core.idkitResultToJson as nativeIdkitResultToJson
// TODO: Re-enable when World ID 4.0 is live
// import uniffi.idkit_core.proveSession as nativeProveSession
import uniffi.idkit_core.request as nativeRequest

typealias IDKitResult = IdKitResult
typealias RpContext = uniffi.idkit_core.RpContext
typealias Environment = uniffi.idkit_core.Environment
typealias DocumentType = uniffi.idkit_core.DocumentType
typealias IdentityAttribute = uniffi.idkit_core.IdentityAttribute
typealias ConnectUrlMode = uniffi.idkit_core.ConnectUrlMode

internal typealias BridgeRequestPayloadWrapper = uniffi.idkit_core.BridgeRequestPayloadWrapper
internal typealias ProofRequestWrapper = uniffi.idkit_core.ProofRequestWrapper

data class IDKitRequestConfig(
    val appId: String,
    val action: String,
    val rpContext: RpContext,
    val actionDescription: String? = null,
    val bridgeUrl: String? = null,
    val allowLegacyProofs: Boolean = false,
    val requireUserPresence: Boolean = false,
    val overrideConnectBaseUrl: String? = null,
    val returnTo: String? = null,
    val environment: Environment? = null,
    val connectUrlMode: ConnectUrlMode? = null,
) {
    internal fun toNative(): NativeIDKitRequestConfig =
        NativeIDKitRequestConfig(
            appId = appId,
            action = action,
            rpContext = rpContext,
            actionDescription = actionDescription,
            bridgeUrl = bridgeUrl,
            allowLegacyProofs = allowLegacyProofs,
            requireUserPresence = requireUserPresence,
            overrideConnectBaseUrl = overrideConnectBaseUrl,
            returnTo = returnTo,
            environment = environment,
            connectUrlMode = connectUrlMode,
        )
}

data class IDKitSessionConfig(
    val appId: String,
    val rpContext: RpContext,
    val actionDescription: String? = null,
    val bridgeUrl: String? = null,
    val requireUserPresence: Boolean = false,
    val overrideConnectBaseUrl: String? = null,
    val returnTo: String? = null,
    val environment: Environment? = null,
) {
    internal fun toNative(): NativeIDKitSessionConfig =
        NativeIDKitSessionConfig(
            appId = appId,
            rpContext = rpContext,
            actionDescription = actionDescription,
            bridgeUrl = bridgeUrl,
            requireUserPresence = requireUserPresence,
            overrideConnectBaseUrl = overrideConnectBaseUrl,
            returnTo = returnTo,
            environment = environment,
        )
}

class IDKitClientError(message: String) : IllegalArgumentException(message)

enum class IDKitErrorCode(val rawValue: String) {
    USER_REJECTED("user_rejected"),
    VERIFICATION_REJECTED("verification_rejected"),
    CREDENTIAL_UNAVAILABLE("credential_unavailable"),
    WORLD_ID_4_NOT_AVAILABLE("world_id_4_not_available"),
    WORLD_ID_3_NOT_AVAILABLE("world_id_3_not_available"),
    MALFORMED_REQUEST("malformed_request"),
    INVALID_NETWORK("invalid_network"),
    INCLUSION_PROOF_PENDING("inclusion_proof_pending"),
    INCLUSION_PROOF_FAILED("inclusion_proof_failed"),
    UNEXPECTED_RESPONSE("unexpected_response"),
    CONNECTION_FAILED("connection_failed"),
    MAX_VERIFICATIONS_REACHED("max_verifications_reached"),
    FAILED_BY_HOST_APP("failed_by_host_app"),
    USER_PRESENCE_FAILED("user_presence_failed"),
    INVALID_RP_SIGNATURE("invalid_rp_signature"),
    NULLIFIER_REPLAYED("nullifier_replayed"),
    DUPLICATE_NONCE("duplicate_nonce"),
    UNKNOWN_RP("unknown_rp"),
    INACTIVE_RP("inactive_rp"),
    TIMESTAMP_TOO_OLD("timestamp_too_old"),
    TIMESTAMP_TOO_FAR_IN_FUTURE("timestamp_too_far_in_future"),
    INVALID_TIMESTAMP("invalid_timestamp"),
    RP_SIGNATURE_EXPIRED("rp_signature_expired"),
    IDENTITY_ATTRIBUTES_NOT_MATCHED("identity_attributes_not_matched"),
    GENERIC_ERROR("generic_error"),
    TIMEOUT("timeout"),
    CANCELLED("cancelled");

    internal companion object {
        fun from(error: AppError): IDKitErrorCode = when (error) {
            AppError.USER_REJECTED -> USER_REJECTED
            AppError.VERIFICATION_REJECTED -> VERIFICATION_REJECTED
            AppError.CREDENTIAL_UNAVAILABLE -> CREDENTIAL_UNAVAILABLE
            AppError.WORLD_ID4_NOT_AVAILABLE -> WORLD_ID_4_NOT_AVAILABLE
            AppError.WORLD_ID3_NOT_AVAILABLE -> WORLD_ID_3_NOT_AVAILABLE
            AppError.MALFORMED_REQUEST -> MALFORMED_REQUEST
            AppError.INVALID_NETWORK -> INVALID_NETWORK
            AppError.INCLUSION_PROOF_PENDING -> INCLUSION_PROOF_PENDING
            AppError.INCLUSION_PROOF_FAILED -> INCLUSION_PROOF_FAILED
            AppError.UNEXPECTED_RESPONSE -> UNEXPECTED_RESPONSE
            AppError.CONNECTION_FAILED -> CONNECTION_FAILED
            AppError.MAX_VERIFICATIONS_REACHED -> MAX_VERIFICATIONS_REACHED
            AppError.FAILED_BY_HOST_APP -> FAILED_BY_HOST_APP
            AppError.USER_PRESENCE_FAILED -> USER_PRESENCE_FAILED
            AppError.INVALID_RP_SIGNATURE -> INVALID_RP_SIGNATURE
            AppError.NULLIFIER_REPLAYED -> NULLIFIER_REPLAYED
            AppError.DUPLICATE_NONCE -> DUPLICATE_NONCE
            AppError.UNKNOWN_RP -> UNKNOWN_RP
            AppError.INACTIVE_RP -> INACTIVE_RP
            AppError.TIMESTAMP_TOO_OLD -> TIMESTAMP_TOO_OLD
            AppError.TIMESTAMP_TOO_FAR_IN_FUTURE -> TIMESTAMP_TOO_FAR_IN_FUTURE
            AppError.INVALID_TIMESTAMP -> INVALID_TIMESTAMP
            AppError.RP_SIGNATURE_EXPIRED -> RP_SIGNATURE_EXPIRED
            AppError.IDENTITY_ATTRIBUTES_NOT_MATCHED -> IDENTITY_ATTRIBUTES_NOT_MATCHED
            AppError.GENERIC_ERROR -> GENERIC_ERROR
        }
    }
}

sealed interface IDKitStatus {
    data object WaitingForConnection : IDKitStatus
    data object AwaitingConfirmation : IDKitStatus
    data class Confirmed(val result: IDKitResult) : IDKitStatus
    data class Failed(val error: IDKitErrorCode) : IDKitStatus
    data class NetworkingError(val error: IDKitErrorCode) : IDKitStatus
}

sealed interface IDKitCompletionResult {
    data class Success(val result: IDKitResult) : IDKitCompletionResult
    data class Failure(val error: IDKitErrorCode) : IDKitCompletionResult
}

data class IDKitPollOptions(
    val pollIntervalMs: ULong = 1_000u,
    val timeoutMs: ULong = 900_000u,
)

// TODO: Re-enable when World ID 4.0 is live
// data class CredentialRequestOptions(
//     val signal: String? = null,
//     val genesisIssuedAtMin: ULong? = null,
//     val expiresAtMin: ULong? = null,
// )

class IDKitBuilder internal constructor(
    private val inner: IdKitBuilder,
) {
    /** Selects preset vs custom constraints for unstable bridge payload inspection. */
    sealed interface DebugSpecification {
        data class FromPreset(val preset: Preset) : DebugSpecification
        data class FromConstraints(val constraints: uniffi.idkit_core.ConstraintNode) : DebugSpecification
    }

    fun constraints(constraints: uniffi.idkit_core.ConstraintNode): IDKitRequest =
        IDKitRequest(inner.constraints(constraints))

    fun preset(preset: Preset): IDKitRequest =
        IDKitRequest(inner.preset(preset))

    // Debug (internal — bindings module tests only; do not use in production)
    internal fun bridgeRequestPayload(specification: DebugSpecification): BridgeRequestPayloadWrapper =
        when (specification) {
            is DebugSpecification.FromPreset -> inner.bridgeRequestPayloadFromPreset(specification.preset)
            is DebugSpecification.FromConstraints -> inner.bridgeRequestPayload(specification.constraints)
        }

    internal fun bridgeRequestPayloadJSON(specification: DebugSpecification): String =
        when (specification) {
            is DebugSpecification.FromPreset -> inner.bridgeRequestPayloadJsonFromPreset(specification.preset)
            is DebugSpecification.FromConstraints -> inner.bridgeRequestPayloadJson(specification.constraints)
        }
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
                    is IDKitStatus.NetworkingError -> delay(pollIntervalMs.toLong())
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
            is StatusWrapper.NetworkingError -> IDKitStatus.NetworkingError(IDKitErrorCode.from(status.error))
        }
    }
}

object IDKit {
    const val version: String = "4.0.0"

    fun request(config: IDKitRequestConfig): IDKitBuilder {
        require(config.appId.isNotBlank()) { "app_id is required" }
        require(config.action.isNotBlank()) { "action is required" }
        return IDKitBuilder(nativeRequest(config.toNative()))
    }

    // TODO: Re-enable when World ID 4.0 is live
    // fun createSession(config: IDKitSessionConfig): IDKitBuilder {
    //     require(config.appId.isNotBlank()) { "app_id is required" }
    //     return IDKitBuilder(nativeCreateSession(config.toNative()))
    // }

    // fun proveSession(sessionId: String, config: IDKitSessionConfig): IDKitBuilder {
    //     require(sessionId.isNotBlank()) { "session_id is required" }
    //     require(config.appId.isNotBlank()) { "app_id is required" }
    //     return IDKitBuilder(nativeProveSession(sessionId, config.toNative()))
    // }

    fun hashSignal(signal: String): String = hashSignalFfi(Signal.fromString(signal))

    fun hashSignal(signal: ByteArray): String = hashSignalFfi(Signal.fromBytes(signal))
}

// TODO: Re-enable when World ID 4.0 is live
// private fun credentialRequestFromOptions(
//     type: CredentialType,
//     options: CredentialRequestOptions,
// ): CredentialRequest {
//     val payload = buildJsonObject {
//         put("type", JsonPrimitive(credentialToString(type)))
//         options.signal?.let { put("signal", JsonPrimitive(it)) }
//         options.genesisIssuedAtMin?.let { put("genesis_issued_at_min", JsonPrimitive(it.toLong())) }
//         options.expiresAtMin?.let { put("expires_at_min", JsonPrimitive(it.toLong())) }
//     }
//     return CredentialRequest.fromJson(payload.toString())
// }

// fun CredentialRequest(type: CredentialType, signal: String? = null): CredentialRequest =
//     CredentialRequest.withStringSignal(type, signal)

// fun CredentialRequest(type: CredentialType, abiEncodedSignal: ByteArray): CredentialRequest =
//     CredentialRequest(type, Signal.fromBytes(abiEncodedSignal))

// fun CredentialRequest(type: CredentialType, options: CredentialRequestOptions): CredentialRequest {
//     if (options.genesisIssuedAtMin == null && options.expiresAtMin == null) {
//         return CredentialRequest.withStringSignal(type, options.signal)
//     }
//
//     if (options.expiresAtMin == null) {
//         return CredentialRequest.withGenesisMin(type, options.signal?.let { Signal.fromString(it) }, options.genesisIssuedAtMin!!)
//     }
//
//     if (options.genesisIssuedAtMin == null) {
//         return CredentialRequest.withExpiresAtMin(type, options.signal?.let { Signal.fromString(it) }, options.expiresAtMin)
//     }
//
//     return credentialRequestFromOptions(type, options)
// }

// fun anyOf(vararg items: CredentialRequest): ConstraintNode =
//     ConstraintNode.any(items.map { ConstraintNode.item(it) })

// fun anyOf(items: List<CredentialRequest>): ConstraintNode =
//     ConstraintNode.any(items.map { ConstraintNode.item(it) })

// fun anyOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
//     ConstraintNode.any(nodes.toList())

// fun anyOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
//     ConstraintNode.any(nodes)

// fun allOf(vararg items: CredentialRequest): ConstraintNode =
//     ConstraintNode.all(items.map { ConstraintNode.item(it) })

// fun allOf(items: List<CredentialRequest>): ConstraintNode =
//     ConstraintNode.all(items.map { ConstraintNode.item(it) })

// fun allOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
//     ConstraintNode.all(nodes.toList())

// fun allOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
//     ConstraintNode.all(nodes)

// fun enumerateOf(vararg items: CredentialRequest): ConstraintNode =
//     enumerateOfNodes(items.map { ConstraintNode.item(it) })

// fun enumerateOf(items: List<CredentialRequest>): ConstraintNode =
//     enumerateOfNodes(items.map { ConstraintNode.item(it) })

// fun enumerateOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
//     enumerateOfNodes(nodes.toList())

// fun enumerateOfNodes(nodes: List<ConstraintNode>): ConstraintNode {
//     val nodesJson = nodes.joinToString(separator = ",") { it.toJson() }
//     return ConstraintNode.fromJson("""{"enumerate":[${nodesJson}]}""")
// }

/**
 * Returns the orb legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
fun orbLegacy(signal: String? = null): Preset = Preset.OrbLegacy(signal = signal)

/**
 * Returns the secure document legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
fun secureDocumentLegacy(signal: String? = null): Preset =
    Preset.SecureDocumentLegacy(signal = signal)

/**
 * Returns the document legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
fun documentLegacy(signal: String? = null): Preset = Preset.DocumentLegacy(signal = signal)

/**
 * Returns the device legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
fun deviceLegacy(signal: String? = null): Preset = Preset.DeviceLegacy(signal = signal)

/**
 * Returns the selfie check legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 * Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
 */
fun selfieCheckLegacy(signal: String? = null): Preset = Preset.SelfieCheckLegacy(signal = signal)

/**
 * Returns the identity check preset.
 */
fun identityCheck(attributes: List<IdentityAttribute>, legacySignal: String? = null): Preset =
    Preset.IdentityCheck(attributes = attributes, legacySignal = legacySignal)

fun idkitResultToJson(result: IDKitResult): String = nativeIdkitResultToJson(result)

fun idkitResultFromJson(json: String): IDKitResult = nativeIdkitResultFromJson(json)

fun hashSignal(signal: Signal): String = hashSignalFfi(signal)

internal val ProofRequestWrapper.credentialIdentifiers: List<String>
    get() = proofRequests.map { it.identifier }

internal val BridgeRequestPayloadWrapper.credentialIdentifiers: List<String>
    get() = proofRequest?.credentialIdentifiers.orEmpty()
