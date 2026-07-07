package com.worldcoin.idkit

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Identity document type used in [IdentityAttribute.DocumentType]. */
public enum class DocumentType(public val rawValue: String) {
    PASSPORT("passport"),
    EID("eid"),
    MNC("mnc"),
}

/**
 * Identity attribute filters for [identityCheck] presets.
 * Wire form matches the Rust core: `{"type": "minimum_age", "value": 21}`.
 */
@Serializable(with = IdentityAttributeSerializer::class)
public sealed class IdentityAttribute {
    public data class DocumentType(val value: com.worldcoin.idkit.DocumentType) : IdentityAttribute()
    public data class DocumentNumber(val value: String) : IdentityAttribute()
    public data class IssuingCountry(val value: String) : IdentityAttribute()
    public data class FullName(val value: String) : IdentityAttribute()
    public data class MinimumAge(val value: UByte) : IdentityAttribute()
    public data class Nationality(val value: String) : IdentityAttribute()
}

internal object IdentityAttributeSerializer : KSerializer<IdentityAttribute> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("com.worldcoin.idkit.IdentityAttribute")

    override fun serialize(encoder: Encoder, value: IdentityAttribute) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw IllegalStateException("IdentityAttribute supports JSON serialization only")
        val (type, jsonValue) = when (value) {
            is IdentityAttribute.DocumentType -> "document_type" to JsonPrimitive(value.value.rawValue)
            is IdentityAttribute.DocumentNumber -> "document_number" to JsonPrimitive(value.value)
            is IdentityAttribute.IssuingCountry -> "issuing_country" to JsonPrimitive(value.value)
            is IdentityAttribute.FullName -> "full_name" to JsonPrimitive(value.value)
            is IdentityAttribute.MinimumAge -> "minimum_age" to JsonPrimitive(value.value.toInt())
            is IdentityAttribute.Nationality -> "nationality" to JsonPrimitive(value.value)
        }
        jsonEncoder.encodeJsonElement(
            buildJsonObject {
                put("type", JsonPrimitive(type))
                put("value", jsonValue)
            },
        )
    }

    override fun deserialize(decoder: Decoder): IdentityAttribute {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw IllegalStateException("IdentityAttribute supports JSON serialization only")
        val obj = jsonDecoder.decodeJsonElement().jsonObject
        val type = obj["type"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalArgumentException("identity attribute is missing \"type\"")
        val value = obj["value"]
            ?: throw IllegalArgumentException("identity attribute is missing \"value\"")
        return when (type) {
            "document_type" -> {
                val raw = value.jsonPrimitive.content
                val documentType = DocumentType.entries.firstOrNull { it.rawValue == raw }
                    ?: throw IllegalArgumentException("unknown document type: $raw")
                IdentityAttribute.DocumentType(documentType)
            }
            "document_number" -> IdentityAttribute.DocumentNumber(value.jsonPrimitive.content)
            "issuing_country" -> IdentityAttribute.IssuingCountry(value.jsonPrimitive.content)
            "full_name" -> IdentityAttribute.FullName(value.jsonPrimitive.content)
            "minimum_age" -> IdentityAttribute.MinimumAge(value.jsonPrimitive.int.toUByte())
            "nationality" -> IdentityAttribute.Nationality(value.jsonPrimitive.content)
            else -> throw IllegalArgumentException("unknown identity attribute type: $type")
        }
    }
}

/**
 * Credential presets for World ID verification.
 *
 * Serial names match the Rust core's `Preset` serde form
 * (`#[serde(tag = "type")]` with PascalCase variants).
 */
@Serializable
public sealed class Preset {
    /** Orb-only verification. World ID 3.0 proofs only. */
    @Serializable
    @SerialName("OrbLegacy")
    public data class OrbLegacy(val signal: String? = null) : Preset()

    /** Secure document verification. World ID 3.0 proofs only. */
    @Serializable
    @SerialName("SecureDocumentLegacy")
    public data class SecureDocumentLegacy(val signal: String? = null) : Preset()

    /** Document verification. World ID 3.0 proofs only. */
    @Serializable
    @SerialName("DocumentLegacy")
    public data class DocumentLegacy(val signal: String? = null) : Preset()

    /** Selfie check verification (preview). World ID 3.0 proofs only. */
    @Serializable
    @SerialName("SelfieCheckLegacy")
    public data class SelfieCheckLegacy(val signal: String? = null) : Preset()

    /** Device verification. World ID 3.0 proofs only. */
    @Serializable
    @SerialName("DeviceLegacy")
    public data class DeviceLegacy(val signal: String? = null) : Preset()

    /** Proof of human (World ID 4.0 with legacy fallback). */
    @Serializable
    @SerialName("ProofOfHuman")
    public data class ProofOfHuman(val signal: String? = null) : Preset()

    /** Passport credential (World ID 4.0 with legacy fallback). */
    @Serializable
    @SerialName("Passport")
    public data class Passport(val signal: String? = null) : Preset()

    /** My Number Card credential (World ID 4.0 with legacy fallback). */
    @Serializable
    @SerialName("Mnc")
    public data class Mnc(val signal: String? = null) : Preset()

    /** Document-based identity attestation (World ID 4.0). */
    @Serializable
    @SerialName("IdentityCheck")
    public data class IdentityCheck(
        val attributes: List<IdentityAttribute>,
        @SerialName("legacy_signal") val legacySignal: String? = null,
    ) : Preset()
}

/**
 * Returns the orb legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
public fun orbLegacy(signal: String? = null): Preset = Preset.OrbLegacy(signal = signal)

/**
 * Returns the secure document legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
public fun secureDocumentLegacy(signal: String? = null): Preset =
    Preset.SecureDocumentLegacy(signal = signal)

/**
 * Returns the document legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
public fun documentLegacy(signal: String? = null): Preset = Preset.DocumentLegacy(signal = signal)

/**
 * Returns the device legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 */
public fun deviceLegacy(signal: String? = null): Preset = Preset.DeviceLegacy(signal = signal)

/**
 * Returns the selfie check legacy preset.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 * Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
 */
public fun selfieCheckLegacy(signal: String? = null): Preset = Preset.SelfieCheckLegacy(signal = signal)

/**
 * Returns the identity check preset.
 */
public fun identityCheck(attributes: List<IdentityAttribute>, legacySignal: String? = null): Preset =
    Preset.IdentityCheck(attributes = attributes, legacySignal = legacySignal)
