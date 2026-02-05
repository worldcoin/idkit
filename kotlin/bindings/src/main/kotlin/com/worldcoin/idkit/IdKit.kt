package com.worldcoin.idkit

import uniffi.idkit_core.ConstraintNode
import uniffi.idkit_core.CredentialRequest
import uniffi.idkit_core.RpContext
import uniffi.idkit_core.Signal
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.IdKitRequestBuilder
import uniffi.idkit_core.IdKitRequestConfig
import uniffi.idkit_core.request
import uniffi.idkit_core.Preset

// Type aliases for public API consistency - UniFFI 0.30 generates IdKit* names
typealias IDKitRequestBuilder = IdKitRequestBuilder
typealias IDKitRequestConfig = IdKitRequestConfig

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
     * Create a CredentialRequest from raw signal bytes.
     */
    fun credentialRequestBytes(
        credentialType: CredentialType,
        signalBytes: ByteArray,
    ): CredentialRequest = CredentialRequest.new(credentialType, Signal.fromBytes(signalBytes))

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
     * Create an RP context for request creation.
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
     * Create an IDKitRequestConfig for building verification requests.
     *
     * @param appId Application ID from the Developer Portal
     * @param action Action identifier
     * @param rpContext RP context for protocol-level proof requests (required)
     * @param actionDescription Optional action description shown to users
     * @param bridgeUrl Optional custom bridge URL
     */
    fun requestConfig(
        appId: String,
        action: String,
        rpContext: RpContext,
        actionDescription: String? = null,
        bridgeUrl: String? = null,
    ): IDKitRequestConfig = IDKitRequestConfig(
        appId = appId,
        action = action,
        rpContext = rpContext,
        actionDescription = actionDescription,
        bridgeUrl = bridgeUrl,
    )

    /**
     * Create an IDKit request builder.
     *
     * This is the main entry point for creating World ID verification requests.
     * Use the builder pattern with constraints to specify which credentials to accept.
     *
     * @param config Request configuration
     * @return An IDKitRequestBuilder instance
     *
     * Example:
     * ```kotlin
     * val idkitRequest = IdKit.request(config).constraints(anyOf(orb, face))
     * val connectUrl = idkitRequest.connectUrl()
     * val status = idkitRequest.pollStatus(pollIntervalMs = 2000u, timeoutMs = 300000u)
     * ```
     */
    fun request(config: IDKitRequestConfig): IDKitRequestBuilder =
        uniffi.idkit_core.request(config)

    /**
     * Create an OrbLegacy preset for World ID 3.0 legacy support.
     *
     * This preset creates a request compatible with both World ID 4.0 and 3.0 protocols.
     * Use this when you need backward compatibility with older World App versions.
     *
     * @param signal Optional signal string
     * @return An OrbLegacy preset
     *
     * Example:
     * ```kotlin
     * val request = IdKit.request(config).preset(orbLegacy(signal = "user-123"))
     * ```
     */
    fun orbLegacy(signal: String? = null): Preset =
        Preset.OrbLegacy(signal = signal)

    /**
     * Create a SecureDocumentLegacy preset for World ID 3.0 legacy support.
     *
     * This preset creates a request compatible with both World ID 4.0 and 3.0 protocols.
     * Use this when you need backward compatibility with older World App versions.
     *
     * @param signal Optional signal string
     * @return A SecureDocumentLegacy preset
     *
     * Example:
     * ```kotlin
     * val request = IdKit.request(config).preset(secureDocumentLegacy(signal = "user-123"))
     * ```
     */
    fun secureDocumentLegacy(signal: String? = null): Preset =
        Preset.SecureDocumentLegacy(signal = signal)

    /**
     * Create a DocumentLegacy preset for World ID 3.0 legacy support.
     *
     * This preset creates a request compatible with both World ID 4.0 and 3.0 protocols.
     * Use this when you need backward compatibility with older World App versions.
     *
     * @param signal Optional signal string
     * @return A DocumentLegacy preset
     *
     * Example:
     * ```kotlin
     * val request = IdKit.request(config).preset(documentLegacy(signal = "user-123"))
     * ```
     */
    fun documentLegacy(signal: String? = null): Preset =
        Preset.DocumentLegacy(signal = signal)

    /**
     * Hash bytes to a field element using Keccak256, shifted right 8 bits.
     * Returns raw bytes (32 bytes).
     */
    fun hashToField(input: ByteArray): ByteArray = uniffi.idkit_core.hashToFieldFfi(input)

    /**
     * Encode a Signal to its hash representation.
     * This is the same encoding used internally when constructing proof requests.
     * Returns a 0x-prefixed hex string.
     */
    fun encodeSignal(signal: Signal): String = uniffi.idkit_core.encodeSignalFfi(signal)
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
 * val request = IdKit.request(config).preset(orbLegacy(signal = "user-123"))
 * ```
 */
fun orbLegacy(signal: String? = null): Preset =
    IdKit.orbLegacy(signal)

/**
 * Create a SecureDocumentLegacy preset for World ID 3.0 legacy support.
 *
 * Example:
 * ```kotlin
 * val request = IdKit.request(config).preset(secureDocumentLegacy(signal = "user-123"))
 * ```
 */
fun secureDocumentLegacy(signal: String? = null): Preset =
    IdKit.secureDocumentLegacy(signal)

/**
 * Create a DocumentLegacy preset for World ID 3.0 legacy support.
 *
 * Example:
 * ```kotlin
 * val request = IdKit.request(config).preset(documentLegacy(signal = "user-123"))
 * ```
 */
fun documentLegacy(signal: String? = null): Preset =
    IdKit.documentLegacy(signal)

/**
 * Hash bytes to a field element using Keccak256, shifted right 8 bits.
 * Returns raw bytes (32 bytes).
 */
fun hashToField(input: ByteArray): ByteArray = IdKit.hashToField(input)

/**
 * Encode a Signal to its hash representation.
 * This is the same encoding used internally when constructing proof requests.
 * Returns a 0x-prefixed hex string.
 */
fun encodeSignal(signal: Signal): String = IdKit.encodeSignal(signal)

// Usage example - Explicit constraints:
//
// val orb = CredentialRequest(CredentialType.ORB, signal = "user-123")
// val face = CredentialRequest(CredentialType.FACE)
//
// val config = IdKit.requestConfig(
//     appId = "app_staging_xxxxx",
//     action = "my-action",
//     rpContext = rpContext,
// )
//
// val request = IdKit.request(config).constraints(anyOf(orb, face))
// val connectUrl = request.connectUrl()
// val status = request.pollStatus(pollIntervalMs = 2000u, timeoutMs = 300000u)
//
// Usage example - Preset (World ID 3.0 legacy support):
//
// val request = IdKit.request(config).preset(orbLegacy(signal = "user-123"))
