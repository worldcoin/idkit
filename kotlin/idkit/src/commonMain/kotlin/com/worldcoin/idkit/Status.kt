package com.worldcoin.idkit

/** Error codes surfaced by verification statuses. Mirrors the Kotlin and Swift SDKs. */
public enum class IDKitErrorCode(public val rawValue: String) {
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

    /** Client-side: [IDKitRequest.pollUntilCompletion] hit its deadline. */
    TIMEOUT("timeout"),

    /** Client-side: the polling coroutine was cancelled. */
    CANCELLED("cancelled"),
    ;

    internal companion object {
        /** Maps a wire error code; unknown codes degrade to [GENERIC_ERROR]. */
        fun from(rawValue: String): IDKitErrorCode =
            entries.firstOrNull { it.rawValue == rawValue } ?: GENERIC_ERROR
    }
}

/** Status of a verification request, as reported by a single poll. */
public sealed interface IDKitStatus {
    /** Waiting for World App to retrieve the request. */
    public data object WaitingForConnection : IDKitStatus

    /** World App has retrieved the request; waiting for user confirmation. */
    public data object AwaitingConfirmation : IDKitStatus

    /** The user confirmed and provided proof(s). */
    public data class Confirmed(val result: IDKitResult) : IDKitStatus

    /** The request failed terminally. */
    public data class Failed(val error: IDKitErrorCode) : IDKitStatus

    /** A transport-level failure; safe to retry. */
    public data class NetworkingError(val error: IDKitErrorCode) : IDKitStatus
}

/** Terminal outcome of [IDKitRequest.pollUntilCompletion]. */
public sealed interface IDKitCompletionResult {
    public data class Success(val result: IDKitResult) : IDKitCompletionResult
    public data class Failure(val error: IDKitErrorCode) : IDKitCompletionResult
}

/** Options for [IDKitRequest.pollUntilCompletion]. */
public data class IDKitPollOptions(
    val pollIntervalMs: ULong = 1_000u,
    val timeoutMs: ULong = 900_000u,
)

/** Convenience accessor for the [IDKitResult] when status is [IDKitStatus.Confirmed]. */
public val IDKitStatus.Confirmed.idkitResult: IDKitResult
    get() = this.result
