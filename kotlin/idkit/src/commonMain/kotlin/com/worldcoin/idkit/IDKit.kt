package com.worldcoin.idkit

import com.worldcoin.idkit.internal.IdKitJson
import com.worldcoin.idkit.internal.NativeBridge
import com.worldcoin.idkit.internal.unwrapEnvelope
import kotlinx.serialization.json.jsonPrimitive

/**
 * IDKit for Kotlin Multiplatform — the World ID SDK for Android and iOS.
 *
 * The public surface mirrors the platform-specific Kotlin and Swift SDKs; the
 * implementation talks directly to the shared Rust core through a small C ABI
 * (`rust/kmp-ffi`).
 */
public object IDKit {
    /** SDK package version, reported to the bridge for request attribution. */
    public val version: String = IDKIT_PACKAGE_VERSION

    /**
     * Starts building a uniqueness verification request.
     *
     * The returned builder opens the bridge connection when [IDKitBuilder.preset]
     * or [IDKitBuilder.constraints] is called.
     */
    public fun request(config: IDKitRequestConfig): IDKitBuilder {
        if (config.appId.isBlank()) throw IDKitClientError("app_id is required")
        if (config.action.isBlank()) throw IDKitClientError("action is required")
        return IDKitBuilder(config.toConfigJson())
    }

    /**
     * Builds the bridge request payload from a preset without opening a network
     * connection. Intended for building test fixtures.
     */
    public fun createBridgePayloadFromPresets(
        config: IDKitRequestConfig,
        preset: Preset,
    ): BridgeRequestPayload {
        val ok = unwrapEnvelope(
            NativeBridge.bridgePayloadFromPreset(
                config.toConfigJson(),
                IdKitJson.encodeToString(Preset.serializer(), preset),
            ),
        )
        return IdKitJson.decodeFromJsonElement(BridgeRequestPayload.serializer(), ok)
    }

    /**
     * Builds the bridge request payload from custom constraints without opening
     * a network connection. Intended for building test fixtures.
     */
    public fun createBridgePayloadFromConstraints(
        config: IDKitRequestConfig,
        constraints: ConstraintNode,
    ): BridgeRequestPayload {
        val ok = unwrapEnvelope(
            NativeBridge.bridgePayloadFromConstraints(
                config.toConfigJson(),
                IdKitJson.encodeToString(ConstraintNode.serializer(), constraints),
            ),
        )
        return IdKitJson.decodeFromJsonElement(BridgeRequestPayload.serializer(), ok)
    }

    /**
     * Hashes a signal to a `0x`-prefixed field element. A valid non-empty
     * even-length `0x`-hex string is hashed as raw bytes, any other string as
     * UTF-8 text (same semantics as the JS `hashSignal`). For signals with
     * interior NUL bytes, use the [ByteArray] overload.
     */
    public fun hashSignal(signal: String): String =
        unwrapEnvelope(NativeBridge.hashSignalString(signal)).jsonPrimitive.content

    /** Hashes raw signal bytes to a `0x`-prefixed field element. */
    public fun hashSignal(signal: ByteArray): String =
        unwrapEnvelope(NativeBridge.hashSignalBytes(signal)).jsonPrimitive.content
}
