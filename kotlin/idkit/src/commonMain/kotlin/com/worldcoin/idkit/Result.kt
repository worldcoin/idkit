package com.worldcoin.idkit

import com.worldcoin.idkit.internal.IdKitJson
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject

/** World App integrity bundle for proving request-time app integrity. */
@Serializable
public data class IntegrityBundle(
    val version: Int,
    /** Signature format used by the device (e.g. `apple_app_attest`, `android_keystore`). */
    @SerialName("signature_format") val signatureFormat: String,
    /** Unix timestamp of this request, in seconds. */
    val timestamp: ULong,
    /** Hex-encoded device signature. */
    val signature: String,
    /** Attestation Gateway JWT proving integrity of the signing key. */
    val jwt: String,
)

/**
 * A single credential response item.
 *
 * Discrimination follows the Rust core's untagged serde: `session_nullifier`
 * present → [Session]; `issuer_schema_id` present → [V4]; otherwise [V3].
 */
@Serializable(with = ResponseItemSerializer::class)
public sealed class ResponseItem {
    /** World ID v4 uniqueness proof. */
    @Serializable
    public data class V4(
        val identifier: String,
        @SerialName("signal_hash") val signalHash: String? = null,
        @SerialName("issuer_schema_id") val issuerSchemaId: ULong,
        /** Compressed Groth16 proof (4 elements) followed by the Merkle root, all hex strings. */
        val proof: List<String>,
        /** RP-scoped nullifier (hex string). */
        val nullifier: String,
        @SerialName("expires_at_min") val expiresAtMin: ULong,
    ) : ResponseItem()

    /** World ID v4 session proof. */
    @Serializable
    public data class Session(
        val identifier: String,
        @SerialName("signal_hash") val signalHash: String? = null,
        @SerialName("issuer_schema_id") val issuerSchemaId: ULong,
        val proof: List<String>,
        /** 1st element is the session nullifier, 2nd is the generated action. */
        @SerialName("session_nullifier") val sessionNullifier: List<String>,
        @SerialName("expires_at_min") val expiresAtMin: ULong,
    ) : ResponseItem()

    /** World ID v3 legacy proof. */
    @Serializable
    public data class V3(
        val identifier: String,
        @SerialName("signal_hash") val signalHash: String,
        /** ABI-encoded proof (hex string). */
        val proof: String,
        @SerialName("merkle_root") val merkleRoot: String,
        val nullifier: String,
    ) : ResponseItem()
}

internal object ResponseItemSerializer : JsonContentPolymorphicSerializer<ResponseItem>(ResponseItem::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<ResponseItem> {
        val obj = element.jsonObject
        return when {
            "session_nullifier" in obj -> ResponseItem.Session.serializer()
            "issuer_schema_id" in obj -> ResponseItem.V4.serializer()
            else -> ResponseItem.V3.serializer()
        }
    }
}

@Serializable
internal data class IDKitResultDto(
    @SerialName("protocol_version") val protocolVersion: String,
    val nonce: String,
    val action: String? = null,
    @SerialName("action_description") val actionDescription: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    val responses: List<ResponseItem> = emptyList(),
    @SerialName("user_presence_completed") val userPresenceCompleted: Boolean,
    val environment: String,
    @SerialName("identity_attested") val identityAttested: Boolean? = null,
    @SerialName("integrity_bundle") val integrityBundle: IntegrityBundle? = null,
)

/**
 * The result of a confirmed verification.
 *
 * [rawJson] is the untouched result JSON from the Rust core; send it verbatim
 * to backend verification endpoints so no field is lost in translation.
 */
public class IDKitResult internal constructor(
    private val dto: IDKitResultDto,
    public val rawJson: String,
) {
    /** Protocol version ("4.0" or "3.0"). */
    public val protocolVersion: String get() = dto.protocolVersion

    /** Nonce used in the request. */
    public val nonce: String get() = dto.nonce

    /** Action identifier (uniqueness proofs only). */
    public val action: String? get() = dto.action

    /** Action description, when provided in the request. */
    public val actionDescription: String? get() = dto.actionDescription

    /** Opaque session identifier (`session_<hex>`, session proofs only). */
    public val sessionId: String? get() = dto.sessionId

    /** Credential responses. */
    public val responses: List<ResponseItem> get() = dto.responses

    /** Whether World App completed the requested user-presence check. */
    public val userPresenceCompleted: Boolean get() = dto.userPresenceCompleted

    /** Environment used for the request ("production" or "staging"). */
    public val environment: String get() = dto.environment

    /** Whether identity attributes were attested (IdentityCheck requests only). */
    public val identityAttested: Boolean? get() = dto.identityAttested

    /** Optional World App integrity bundle. */
    public val integrityBundle: IntegrityBundle? get() = dto.integrityBundle

    override fun equals(other: Any?): Boolean = other is IDKitResult && other.dto == dto
    override fun hashCode(): Int = dto.hashCode()
    override fun toString(): String = "IDKitResult(protocolVersion=$protocolVersion, " +
        "responses=${responses.size}, environment=$environment)"

    public companion object {
        /** Parses a result from its JSON wire form. */
        public fun fromJson(json: String): IDKitResult =
            IDKitResult(IdKitJson.decodeFromString(IDKitResultDto.serializer(), json), json)
    }
}

/** Serializes a result to JSON — returns the raw wire form unchanged. */
public fun idkitResultToJson(result: IDKitResult): String = result.rawJson

/** Parses a result from its JSON wire form. */
public fun idkitResultFromJson(json: String): IDKitResult = IDKitResult.fromJson(json)
