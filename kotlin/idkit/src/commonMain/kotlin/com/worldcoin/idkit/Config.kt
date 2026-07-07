package com.worldcoin.idkit

import com.worldcoin.idkit.internal.IdKitJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

internal const val SDK_PACKAGE_NAME: String = "idkit_kotlin"

/** Bridge environment. */
@Serializable
public enum class Environment {
    @SerialName("production")
    PRODUCTION,

    @SerialName("staging")
    STAGING,
}

/** Controls the format of [IDKitRequest.connectorURI]. */
@Serializable
public enum class ConnectUrlMode {
    /** The standard World App connect URL. */
    @SerialName("default")
    DEFAULT,

    /** Wraps the connect URL inside an Apple App Clip invocation URL. */
    @SerialName("app_clip")
    APP_CLIP,
}

/**
 * Relying Party context for protocol-level proof requests.
 *
 * Timestamps are Unix seconds. Validation (the `rp_` prefix, clock skew on
 * [createdAt], expiry ordering) happens in the Rust core when the context is
 * first used; violations surface as [IDKitException] with code `malformed_request`.
 */
@Serializable
public data class RpContext(
    @SerialName("rp_id") val rpId: String,
    val nonce: String,
    @SerialName("created_at") val createdAt: ULong,
    @SerialName("expires_at") val expiresAt: ULong,
    val signature: String,
)

/** Configuration for [IDKit.request]. Mirrors the Kotlin and Swift SDKs. */
public data class IDKitRequestConfig(
    val appId: String,
    val action: String,
    val rpContext: RpContext,
    val actionDescription: String? = null,
    val bridgeUrl: String? = null,
    val allowLegacyProofs: Boolean = false,
    val requireUserPresence: Boolean = false,
    val overrideConnectBaseUrl: String? = null,
    val returnTo: String? = null,
    val environment: Environment? = null,
    val connectUrlMode: ConnectUrlMode? = null,
)

/**
 * Wire DTO consumed by `RequestConfigDto` in rust/kmp-ffi/src/config.rs.
 * The Rust side rejects unknown fields, so names here must match exactly.
 */
@Serializable
internal data class RequestConfigDto(
    @SerialName("app_id") val appId: String,
    @SerialName("package_name") val packageName: String,
    @SerialName("package_version") val packageVersion: String,
    val action: String,
    @SerialName("rp_context") val rpContext: RpContext,
    @SerialName("action_description") val actionDescription: String? = null,
    @SerialName("bridge_url") val bridgeUrl: String? = null,
    @SerialName("allow_legacy_proofs") val allowLegacyProofs: Boolean,
    @SerialName("require_user_presence") val requireUserPresence: Boolean? = null,
    @SerialName("override_connect_base_url") val overrideConnectBaseUrl: String? = null,
    @SerialName("return_to") val returnTo: String? = null,
    val environment: Environment? = null,
    @SerialName("connect_url_mode") val connectUrlMode: ConnectUrlMode? = null,
)

internal fun IDKitRequestConfig.toConfigJson(): String {
    val dto = RequestConfigDto(
        appId = appId,
        // Package identity is fixed by the SDK for request attribution
        // (PR #293); it is deliberately not user-configurable.
        packageName = SDK_PACKAGE_NAME,
        packageVersion = IDKit.version,
        action = action,
        rpContext = rpContext,
        actionDescription = actionDescription,
        bridgeUrl = bridgeUrl,
        allowLegacyProofs = allowLegacyProofs,
        requireUserPresence = requireUserPresence,
        overrideConnectBaseUrl = overrideConnectBaseUrl,
        returnTo = returnTo,
        environment = environment,
        connectUrlMode = connectUrlMode,
    )
    return IdKitJson.encodeToString(RequestConfigDto.serializer(), dto)
}
