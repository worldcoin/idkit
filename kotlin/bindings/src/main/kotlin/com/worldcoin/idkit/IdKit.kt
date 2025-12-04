package com.worldcoin.idkit

import uniffi.idkit.ConstraintNode
import uniffi.idkit.Constraints
import uniffi.idkit.Request
import uniffi.idkit.Session
import uniffi.idkit.Signal
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.VerificationLevel

/**
 * Lightweight Kotlin conveniences mirroring the Swift helpers and adding
 * simple factories for common flows (multiple requests, verification level).
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
        faceAuth: Boolean? = null,
    ): Request = Request(credentialType, signal?.let { Signal.fromString(it) })
        .let { faceAuth?.let(it::withFaceAuth) ?: it }

    /**
     * Create a request from ABI-encoded signal bytes.
     */
    fun requestAbi(
        credentialType: CredentialType,
        abiEncodedSignal: ByteArray,
        faceAuth: Boolean? = null,
    ): Request = Request(credentialType, Signal.fromAbiEncoded(abiEncodedSignal))
        .let { faceAuth?.let(it::withFaceAuth) ?: it }

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
     * Build a session from multiple requests.
     */
    fun session(
        appId: String,
        action: String,
        requests: List<Request>,
        actionDescription: String? = null,
        constraints: Constraints? = null,
        bridgeUrl: String? = null,
    ): Session = when {
        actionDescription != null || constraints != null || bridgeUrl != null ->
            Session.createWithOptions(
                appId,
                action,
                requests,
                actionDescription,
                constraints,
                bridgeUrl,
            )
        else -> Session.create(appId, action, requests)
    }

    /**
     * Convenience to map a verification level into the appropriate requests/constraints.
     * Equivalent to the Swift `fromVerificationLevel` convenience.
     */
    fun sessionFromVerificationLevel(
        appId: String,
        action: String,
        verificationLevel: VerificationLevel,
        signal: String = "",
    ): Session = Session.fromVerificationLevel(appId, action, verificationLevel, signal)
}
