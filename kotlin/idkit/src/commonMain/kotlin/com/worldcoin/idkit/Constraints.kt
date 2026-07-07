package com.worldcoin.idkit

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject

/** Credential type for [CredentialRequest]. */
@Serializable
public enum class CredentialType {
    @SerialName("proof_of_human")
    PROOF_OF_HUMAN,

    @SerialName("selfie")
    SELFIE,

    @SerialName("passport")
    PASSPORT,

    @SerialName("mnc")
    MNC,
}

/**
 * A single credential request inside a constraint tree.
 *
 * [signal] follows IDKit hashSignal semantics: a `0x`-prefixed even-length hex
 * string is hashed as raw bytes, any other string as UTF-8 text.
 */
@Serializable
public data class CredentialRequest(
    val type: CredentialType,
    val signal: String? = null,
    @SerialName("genesis_issued_at_min") val genesisIssuedAtMin: ULong? = null,
    @SerialName("expires_at_min") val expiresAtMin: ULong? = null,
)

/**
 * World ID 4.0 constraint tree. Wire form matches the Rust core's untagged
 * serde representation: an item is a flat [CredentialRequest] object, and
 * combinators are `{"any": [...]}`, `{"all": [...]}`, `{"enumerate": [...]}`.
 *
 * Structural validation (depth/size limits, combinator arity) happens in the
 * Rust core; violations surface as [IDKitException].
 */
@Serializable(with = ConstraintNodeSerializer::class)
public sealed class ConstraintNode {
    public data class Item(val request: CredentialRequest) : ConstraintNode()
    public data class AnyOf(val nodes: List<ConstraintNode>) : ConstraintNode()
    public data class AllOf(val nodes: List<ConstraintNode>) : ConstraintNode()
    public data class EnumerateOf(val nodes: List<ConstraintNode>) : ConstraintNode()
}

internal object ConstraintNodeSerializer : KSerializer<ConstraintNode> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("com.worldcoin.idkit.ConstraintNode")

    private val listSerializer = ListSerializer(ConstraintNodeSerializer)

    override fun serialize(encoder: Encoder, value: ConstraintNode) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw IllegalStateException("ConstraintNode supports JSON serialization only")
        val json = jsonEncoder.json
        val element = when (value) {
            is ConstraintNode.Item -> json.encodeToJsonElement(CredentialRequest.serializer(), value.request)
            is ConstraintNode.AnyOf -> buildJsonObject {
                put("any", json.encodeToJsonElement(listSerializer, value.nodes))
            }
            is ConstraintNode.AllOf -> buildJsonObject {
                put("all", json.encodeToJsonElement(listSerializer, value.nodes))
            }
            is ConstraintNode.EnumerateOf -> buildJsonObject {
                put("enumerate", json.encodeToJsonElement(listSerializer, value.nodes))
            }
        }
        jsonEncoder.encodeJsonElement(element)
    }

    override fun deserialize(decoder: Decoder): ConstraintNode {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw IllegalStateException("ConstraintNode supports JSON serialization only")
        val json = jsonDecoder.json
        val obj = jsonDecoder.decodeJsonElement().jsonObject
        return when {
            "any" in obj -> ConstraintNode.AnyOf(json.decodeFromJsonElement(listSerializer, obj.getValue("any")))
            "all" in obj -> ConstraintNode.AllOf(json.decodeFromJsonElement(listSerializer, obj.getValue("all")))
            "enumerate" in obj ->
                ConstraintNode.EnumerateOf(json.decodeFromJsonElement(listSerializer, obj.getValue("enumerate")))
            else -> ConstraintNode.Item(json.decodeFromJsonElement(CredentialRequest.serializer(), obj))
        }
    }
}

/** Builds an `any` constraint over credential requests: at least one must be satisfiable. */
public fun anyOf(vararg requests: CredentialRequest): ConstraintNode =
    ConstraintNode.AnyOf(requests.map { ConstraintNode.Item(it) })

/** Builds an `any` constraint over credential requests: at least one must be satisfiable. */
public fun anyOf(requests: List<CredentialRequest>): ConstraintNode =
    ConstraintNode.AnyOf(requests.map { ConstraintNode.Item(it) })

/** Builds an `any` constraint over constraint nodes. */
public fun anyOfNodes(nodes: List<ConstraintNode>): ConstraintNode = ConstraintNode.AnyOf(nodes)

/** Builds an `all` constraint over credential requests: every one must be satisfiable. */
public fun allOf(vararg requests: CredentialRequest): ConstraintNode =
    ConstraintNode.AllOf(requests.map { ConstraintNode.Item(it) })

/** Builds an `all` constraint over credential requests: every one must be satisfiable. */
public fun allOf(requests: List<CredentialRequest>): ConstraintNode =
    ConstraintNode.AllOf(requests.map { ConstraintNode.Item(it) })

/** Builds an `all` constraint over constraint nodes. */
public fun allOfNodes(nodes: List<ConstraintNode>): ConstraintNode = ConstraintNode.AllOf(nodes)

/** Builds an `enumerate` constraint: World App reports each satisfiable branch. */
public fun enumerateOf(vararg requests: CredentialRequest): ConstraintNode =
    ConstraintNode.EnumerateOf(requests.map { ConstraintNode.Item(it) })

/** Builds an `enumerate` constraint: World App reports each satisfiable branch. */
public fun enumerateOf(requests: List<CredentialRequest>): ConstraintNode =
    ConstraintNode.EnumerateOf(requests.map { ConstraintNode.Item(it) })

/** Builds an `enumerate` constraint over constraint nodes. */
public fun enumerateOfNodes(nodes: List<ConstraintNode>): ConstraintNode =
    ConstraintNode.EnumerateOf(nodes)
