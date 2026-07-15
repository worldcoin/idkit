package com.worldcoin.idkit

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** World ID 3.0 verification level. */
@Serializable
public enum class VerificationLevel {
    @SerialName("orb")
    ORB,

    @SerialName("face")
    FACE,

    @SerialName("device")
    DEVICE,

    @SerialName("document")
    DOCUMENT,

    @SerialName("secure_document")
    SECURE_DOCUMENT,
}

/** A per-credential request line item inside a [ProofRequest]. */
@Serializable
public data class CredentialRequestItem(
    val identifier: String,
    @SerialName("issuer_schema_id") val issuerSchemaId: ULong,
    val signal: String? = null,
    @SerialName("genesis_issued_at_min") val genesisIssuedAtMin: ULong? = null,
    @SerialName("expires_at_min") val expiresAtMin: ULong? = null,
)

/** Protocol-level proof request inside a [BridgeRequestPayload]. */
@Serializable
public data class ProofRequest(
    val version: Int,
    @SerialName("proof_type") val proofType: String,
    @SerialName("rp_id") val rpId: String,
    val id: String,
    @SerialName("created_at") val createdAt: ULong,
    @SerialName("expires_at") val expiresAt: ULong,
    val action: String? = null,
    val nonce: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    @SerialName("oprf_key_id") val oprfKeyId: String? = null,
    val signature: String? = null,
    @SerialName("proof_requests") val proofRequests: List<CredentialRequestItem> = emptyList(),
)

/**
 * Typed projection of the plaintext bridge request payload, exposed for
 * building test fixtures via [IDKit.createBridgePayloadFromPresets] and
 * [IDKit.createBridgePayloadFromConstraints].
 */
@Serializable
public data class BridgeRequestPayload(
    @SerialName("app_id") val appId: String,
    @SerialName("package_name") val packageName: String,
    @SerialName("package_version") val packageVersion: String,
    val signal: String,
    @SerialName("verification_level") val verificationLevel: VerificationLevel,
    @SerialName("allow_legacy_proofs") val allowLegacyProofs: Boolean,
    @SerialName("require_user_presence") val requireUserPresence: Boolean,
    val environment: Environment,
    val action: String? = null,
    @SerialName("action_description") val actionDescription: String? = null,
    val timestamp: String? = null,
    @SerialName("proof_request") val proofRequest: ProofRequest? = null,
    @SerialName("identity_attributes") val identityAttributes: List<IdentityAttribute>? = null,
    @SerialName("return_to_url") val returnToUrl: String? = null,
)

/** Credential identifiers requested by this proof request, in request order. */
public val ProofRequest.credentialIdentifiers: List<String>
    get() = proofRequests.map { it.identifier }

/** Credential identifiers requested by this payload, in request order. */
public val BridgeRequestPayload.credentialIdentifiers: List<String>
    get() = proofRequest?.credentialIdentifiers.orEmpty()
