package com.worldcoin.idkit

import uniffi.idkit.ConstraintNode
import uniffi.idkit.Constraints
import uniffi.idkit.Request
import uniffi.idkit.RpContext
import uniffi.idkit.Session
import uniffi.idkit.Signal
import uniffi.idkit_core.CredentialType

/**
 * Lightweight Kotlin conveniences mirroring the Swift helpers and adding
 * simple factories for common flows.
 *
 * These wrap the UniFFI-generated types but keep everything in Kotlin land.
 */
object IdKit {
    /**
     * Create a request from a credential type and optional signal string.
     */
    fun request(
        credentialType: CredentialType,
        signal: String? = null,
    ): Request = Request(credentialType, signal?.let { Signal.fromString(it) })

    /**
     * Create a request from ABI-encoded signal bytes.
     */
    fun requestAbi(
        credentialType: CredentialType,
        abiEncodedSignal: ByteArray,
    ): Request = Request(credentialType, Signal.fromAbiEncoded(abiEncodedSignal))

    /**
     * Build constraints requiring at least one credential from the provided list.
     */
    fun anyOf(vararg credentials: CredentialType): Constraints =
        Constraints.any(credentials.toList())

    /**
     * Build constraints requiring all provided credentials.
     */
    fun allOf(vararg credentials: CredentialType): Constraints =
        Constraints.all(credentials.toList())

    /**
     * Create an RP context for session creation.
     *
     * In production, the rp_context should be generated and signed by your backend.
     *
     * @param rpId The registered RP ID (e.g., "rp_123456789abcdef0")
     * @param nonce Unique nonce for this proof request
     * @param createdAt Unix timestamp (seconds since epoch) when created
     * @param expiresAt Unix timestamp (seconds since epoch) when expires
     * @param signature The RP's ECDSA signature of the nonce and created_at timestamp
     */
    fun rpContext(
        rpId: String,
        nonce: String,
        createdAt: ULong,
        expiresAt: ULong,
        signature: String,
    ): RpContext = RpContext(rpId, nonce, createdAt, expiresAt, signature)

    /**
     * Build a session from multiple requests.
     *
     * @param appId Application ID from the Developer Portal
     * @param action Action identifier
     * @param requests List of credential requests
     * @param rpContext RP context for protocol-level proof requests (required)
     * @param actionDescription Optional action description shown to users
     * @param constraints Optional constraints on which credentials are acceptable
     * @param bridgeUrl Optional custom bridge URL
     */
    fun session(
        appId: String,
        action: String,
        requests: List<Request>,
        rpContext: RpContext,
        actionDescription: String? = null,
        constraints: Constraints? = null,
        bridgeUrl: String? = null,
    ): Session = Session.create(
        appId,
        action,
        requests,
        rpContext,
        actionDescription,
        constraints,
        bridgeUrl,
    )
}
