package com.worldcoin.idkit

import uniffi.idkit_core.ConstraintNode
import uniffi.idkit_core.CredentialRequest
import uniffi.idkit_core.RpContext
import uniffi.idkit_core.Signal
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.VerifyBuilder
import uniffi.idkit_core.VerifyConfig
import uniffi.idkit_core.verify
import uniffi.idkit_core.Preset
import uniffi.idkit_core.OrbLegacyPreset

/**
 * Lightweight Kotlin conveniences mirroring the Swift helpers and adding
 * simple factories for common flows.
 *
 * These wrap the UniFFI-generated types but keep everything in Kotlin land.
 */
object IdKit {
    /**
     * Create a CredentialRequest from a credential type and optional signal string.
     *
     * Example:
     * ```kotlin
     * val orb = IdKit.credentialRequest(CredentialType.ORB, signal = "user-123")
     * val face = IdKit.credentialRequest(CredentialType.FACE)
     * ```
     */
    fun credentialRequest(
        credentialType: CredentialType,
        signal: String? = null,
    ): CredentialRequest = CredentialRequest.new(credentialType, signal?.let { Signal.fromString(it) })

    /**
     * Create a CredentialRequest from ABI-encoded signal bytes.
     */
    fun credentialRequestAbi(
        credentialType: CredentialType,
        abiEncodedSignal: ByteArray,
    ): CredentialRequest = CredentialRequest.new(credentialType, Signal.fromAbiEncoded(abiEncodedSignal))

    /**
     * Build an OR constraint - at least one item must be satisfied.
     *
     * Example:
     * ```kotlin
     * val constraint = IdKit.anyOf(orb, face)
     * ```
     */
    fun anyOf(vararg items: CredentialRequest): ConstraintNode =
        ConstraintNode.any(items.map { ConstraintNode.item(it) })

    /**
     * Build an OR constraint from a list of items.
     */
    fun anyOf(items: List<CredentialRequest>): ConstraintNode =
        ConstraintNode.any(items.map { ConstraintNode.item(it) })

    /**
     * Build an OR constraint from constraint nodes.
     *
     * Example:
     * ```kotlin
     * val constraint = IdKit.anyOfNodes(orbNode, anyOf(document, secureDocument))
     * ```
     */
    fun anyOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
        ConstraintNode.any(nodes.toList())

    /**
     * Build an OR constraint from a list of constraint nodes.
     */
    fun anyOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
        ConstraintNode.any(nodes)

    /**
     * Build an AND constraint - all items must be satisfied.
     *
     * Example:
     * ```kotlin
     * val constraint = IdKit.allOf(orb, document)
     * ```
     */
    fun allOf(vararg items: CredentialRequest): ConstraintNode =
        ConstraintNode.all(items.map { ConstraintNode.item(it) })

    /**
     * Build an AND constraint from a list of items.
     */
    fun allOf(items: List<CredentialRequest>): ConstraintNode =
        ConstraintNode.all(items.map { ConstraintNode.item(it) })

    /**
     * Build an AND constraint from constraint nodes.
     *
     * Example:
     * ```kotlin
     * val constraint = IdKit.allOfNodes(orbNode, anyOf(document, secureDocument))
     * ```
     */
    fun allOfNodes(vararg nodes: ConstraintNode): ConstraintNode =
        ConstraintNode.all(nodes.toList())

    /**
     * Build an AND constraint from a list of constraint nodes.
     */
    fun allOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
        ConstraintNode.all(nodes)

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
     * Create a VerifyConfig for building verification sessions.
     *
     * @param appId Application ID from the Developer Portal
     * @param action Action identifier
     * @param rpContext RP context for protocol-level proof requests (required)
     * @param actionDescription Optional action description shown to users
     * @param bridgeUrl Optional custom bridge URL
     */
    fun verifyConfig(
        appId: String,
        action: String,
        rpContext: RpContext,
        actionDescription: String? = null,
        bridgeUrl: String? = null,
    ): VerifyConfig = VerifyConfig(
        appId = appId,
        action = action,
        rpContext = rpContext,
        actionDescription = actionDescription,
        bridgeUrl = bridgeUrl,
    )

    /**
     * Create an OrbLegacy preset for World ID 3.0 legacy support.
     *
     * This preset creates a session compatible with both World ID 4.0 and 3.0 protocols.
     * Use this when you need backward compatibility with older World App versions.
     *
     * @param signal Optional signal string
     * @return An OrbLegacy preset
     *
     * Example:
     * ```kotlin
     * val session = verify(config).preset(orbLegacy(signal = "user-123"))
     * ```
     */
    fun orbLegacy(signal: String? = null): Preset =
        Preset.OrbLegacy(OrbLegacyPreset(signal = signal))
}

// Top-level convenience functions for more idiomatic Kotlin usage

/**
 * Create a CredentialRequest for a credential type.
 *
 * Example:
 * ```kotlin
 * val orb = CredentialRequest(CredentialType.ORB, signal = "user-123")
 * val face = CredentialRequest(CredentialType.FACE)
 * ```
 */
fun CredentialRequest(type: CredentialType, signal: String? = null): CredentialRequest =
    IdKit.credentialRequest(type, signal)

/**
 * Build an OR constraint - at least one item must be satisfied.
 *
 * Example:
 * ```kotlin
 * val constraint = anyOf(orb, face)
 * ```
 */
fun anyOf(vararg items: CredentialRequest): ConstraintNode =
    IdKit.anyOf(*items)

/**
 * Build an AND constraint - all items must be satisfied.
 *
 * Example:
 * ```kotlin
 * val constraint = allOf(orb, document)
 * ```
 */
fun allOf(vararg items: CredentialRequest): ConstraintNode =
    IdKit.allOf(*items)

/**
 * Create an OrbLegacy preset for World ID 3.0 legacy support.
 *
 * Example:
 * ```kotlin
 * val session = verify(config).preset(orbLegacy(signal = "user-123"))
 * ```
 */
fun orbLegacy(signal: String? = null): Preset =
    IdKit.orbLegacy(signal)

// Usage example - Explicit constraints:
//
// val orb = CredentialRequest(CredentialType.ORB, signal = "user-123")
// val face = CredentialRequest(CredentialType.FACE)
//
// val config = IdKit.verifyConfig(
//     appId = "app_staging_xxxxx",
//     action = "my-action",
//     rpContext = rpContext,
// )
//
// val session = verify(config).constraints(anyOf(orb, face))
// val connectUrl = session.connectUrl()
// val status = session.pollStatus(pollIntervalMs = 2000u, timeoutMs = 300000u)
//
// Usage example - Preset (World ID 3.0 legacy support):
//
// val session = verify(config).preset(orbLegacy(signal = "user-123"))
