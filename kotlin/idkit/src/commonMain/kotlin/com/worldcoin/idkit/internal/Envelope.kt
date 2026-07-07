package com.worldcoin.idkit.internal

import com.worldcoin.idkit.IDKitException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject

@Serializable
internal data class EnvelopeError(
    val code: String,
    val message: String,
)

@Serializable
private data class EnvelopeDto(
    val ok: JsonElement? = null,
    @SerialName("err") val error: EnvelopeError? = null,
)

/**
 * Unwraps a `{"ok": ...}` / `{"err": {...}}` envelope from the C ABI.
 *
 * @return the `ok` value
 * @throws IDKitException carrying the wire error code and message
 */
internal fun unwrapEnvelope(envelopeJson: String): JsonElement {
    val envelope = try {
        // Decode via JsonElement first so `ok` values of any JSON type survive.
        val root = IdKitJson.parseToJsonElement(envelopeJson).jsonObject
        EnvelopeDto(
            ok = root["ok"],
            error = root["err"]?.let { IdKitJson.decodeFromJsonElement(EnvelopeError.serializer(), it) },
        )
    } catch (cause: SerializationException) {
        throw IDKitException(
            code = "invalid_envelope",
            message = "malformed FFI envelope: ${cause.message}",
        )
    } catch (cause: IllegalArgumentException) {
        throw IDKitException(
            code = "invalid_envelope",
            message = "malformed FFI envelope: ${cause.message}",
        )
    }

    envelope.ok?.let { return it }
    envelope.error?.let { throw IDKitException(code = it.code, message = it.message) }
    throw IDKitException(code = "invalid_envelope", message = "FFI envelope has neither ok nor err")
}
