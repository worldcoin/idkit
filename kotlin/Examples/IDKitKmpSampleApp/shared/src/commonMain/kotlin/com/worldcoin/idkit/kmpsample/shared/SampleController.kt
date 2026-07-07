package com.worldcoin.idkit.kmpsample.shared

import com.worldcoin.idkit.DocumentType
import com.worldcoin.idkit.Environment
import com.worldcoin.idkit.IDKit
import com.worldcoin.idkit.IDKitRequest
import com.worldcoin.idkit.IDKitRequestConfig
import com.worldcoin.idkit.IDKitStatus
import com.worldcoin.idkit.IdentityAttribute
import com.worldcoin.idkit.Preset
import com.worldcoin.idkit.RpContext
import com.worldcoin.idkit.deviceLegacy
import com.worldcoin.idkit.documentLegacy
import com.worldcoin.idkit.identityCheck
import com.worldcoin.idkit.orbLegacy
import com.worldcoin.idkit.secureDocumentLegacy
import com.worldcoin.idkit.selfieCheckLegacy
import com.worldcoin.idkit.statusFlow
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.time.Duration.Companion.milliseconds

enum class SampleEnvironment(val label: String) {
    PRODUCTION(label = "production"),
    STAGING(label = "staging"),
}

enum class SamplePreset(val label: String) {
    ORB(label = "orb"),
    SECURE_DOCUMENT(label = "secure document"),
    DOCUMENT(label = "document"),
    DEVICE(label = "device"),
    SELFIE_CHECK(label = "selfie check"),
    IDENTITY_CHECK(label = "identity check"),
    ;

    internal fun toPreset(signal: String): Preset = when (this) {
        ORB -> orbLegacy(signal = signal)
        SECURE_DOCUMENT -> secureDocumentLegacy(signal = signal)
        DOCUMENT -> documentLegacy(signal = signal)
        DEVICE -> deviceLegacy(signal = signal)
        SELFIE_CHECK -> selfieCheckLegacy(signal = signal)
        IDENTITY_CHECK -> identityCheck(
            attributes = listOf(
                IdentityAttribute.MinimumAge(value = 21u),
                IdentityAttribute.Nationality(value = "JPN"),
                IdentityAttribute.DocumentType(value = DocumentType.PASSPORT),
            ),
        )
    }
}

data class SampleUiState(
    val appId: String = "app_d8bbd5341f16fb97a61e644b7e169c0e",
    val rpId: String = "rp_7b4f23dd5fb2a826",
    val action: String = "test-action",
    val signal: String = "signal",
    val environment: SampleEnvironment = SampleEnvironment.PRODUCTION,
    val preset: SamplePreset = SamplePreset.DEVICE,
    val connectorUrl: String? = null,
    val isLoading: Boolean = false,
    val logs: String = "",
)

@Serializable
private data class SignaturePayload(
    val sig: String,
    val nonce: String,
    @SerialName(value = "created_at") val createdAt: Long,
    @SerialName(value = "expires_at") val expiresAt: Long,
)

/**
 * Shared verification flow driven by both the Compose and SwiftUI UIs:
 * fetch an RP signature from the demo backend, create an IDKit request,
 * expose the connector URL, poll for the proof, and verify it server-side.
 */
class SampleController {
    private val signatureEndpoint = "https://idkit-js-example.vercel.app/api/rp-signature"
    private val verifyEndpoint = "https://idkit-js-example.vercel.app/api/verify-proof"
    private val returnToUrl = "idkitkmpsample://callback"

    private val scope = CoroutineScope(context = SupervisorJob() + Dispatchers.Main)
    private val http = HttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    private val _state = MutableStateFlow(value = SampleUiState())
    val state = _state.asStateFlow()

    private var pendingRequest: IDKitRequest? = null
    private var pollJob: Job? = null

    fun setAction(value: String) = _state.update { it.copy(action = value) }
    fun setSignal(value: String) = _state.update { it.copy(signal = value) }
    fun setEnvironment(value: SampleEnvironment) = _state.update { it.copy(environment = value) }
    fun setPreset(value: SamplePreset) = _state.update { it.copy(preset = value) }

    /**
     * Callback-based observation for SwiftUI (StateFlow generics erase in ObjC).
     * Observation lasts until [dispose] cancels the controller scope.
     */
    fun watchState(block: (SampleUiState) -> Unit) {
        scope.launch { state.collect { block(it) } }
    }

    fun generateRequest() {
        val snapshot = _state.value
        scope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                log("Fetching RP signature from $signatureEndpoint")
                val signature = fetchSignaturePayload(snapshot.action)

                val config = IDKitRequestConfig(
                    appId = snapshot.appId,
                    action = snapshot.action,
                    rpContext = RpContext(
                        rpId = snapshot.rpId,
                        nonce = signature.nonce,
                        createdAt = signature.createdAt.toULong(),
                        expiresAt = signature.expiresAt.toULong(),
                        signature = signature.sig,
                    ),
                    actionDescription = "KMP sample",
                    allowLegacyProofs = false,
                    requireUserPresence = false,
                    returnTo = returnToUrl,
                    environment = when (snapshot.environment) {
                        SampleEnvironment.PRODUCTION -> Environment.PRODUCTION
                        SampleEnvironment.STAGING -> Environment.STAGING
                    },
                )

                val request = IDKit.request(config).preset(snapshot.preset.toPreset(snapshot.signal))

                pendingRequest?.close()
                pendingRequest = request
                _state.update { it.copy(connectorUrl = request.connectorURI) }
                log("Using preset: ${snapshot.preset.label}")
                log("Generated request ID: ${request.requestId}")
                log("Configured return_to callback: $returnToUrl")
                startPolling(request, reason = "request generation")
            } catch (error: Throwable) {
                log("Error: ${error.message ?: error::class.simpleName}")
            } finally {
                _state.update { it.copy(isLoading = false) }
            }
        }
    }

    fun handleDeepLink(url: String) {
        log("Received deep link callback: $url")
        val request = pendingRequest
        if (request == null) {
            log("No pending request found. Generate a connector URL first.")
            return
        }
        if (pollJob?.isActive == true) {
            log("Polling already running for request ${request.requestId}.")
            return
        }
        startPolling(request, reason = "deep link callback")
    }

    fun dispose() {
        pendingRequest?.close()
        http.close()
        scope.cancel()
    }

    private fun startPolling(request: IDKitRequest, reason: String) {
        pollJob?.cancel()
        log("Started polling for request ${request.requestId} (trigger: $reason).")
        pollJob = scope.launch {
            val finished = withTimeoutOrNull(timeout = 180_000.milliseconds) {
                request.statusFlow(pollIntervalMs = 2_000u).collect { status ->
                    when (status) {
                        IDKitStatus.WaitingForConnection -> log("Waiting for World App to connect...")
                        IDKitStatus.AwaitingConfirmation -> log("Awaiting user confirmation...")
                        is IDKitStatus.Confirmed -> {
                            pendingRequest = null
                            request.close()
                            log("Proof confirmed. Calling verify endpoint: $verifyEndpoint")
                            try {
                                log("Verify response: ${verifyProof(resultJson = status.result.rawJson)}")
                            } catch (error: Throwable) {
                                log("Verify request failed: ${error.message ?: error::class.simpleName}")
                            }
                        }

                        is IDKitStatus.Failed -> log("Proof completion failed: ${status.error.rawValue}")
                        is IDKitStatus.NetworkingError -> log("Networking error (${status.error.rawValue}), retrying...")
                    }
                }
            }
            if (finished == null) {
                log("Proof completion failed: timeout")
            }
        }
    }

    private suspend fun fetchSignaturePayload(action: String): SignaturePayload {
        val response = http.post(urlString = signatureEndpoint) {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("action", action) }.toString())
        }
        val body = response.bodyAsText()
        check(value = response.status.isSuccess()) { "Backend request failed (${response.status.value}): $body" }
        return json.decodeFromString(deserializer = SignaturePayload.serializer(), string = body)
    }

    private suspend fun verifyProof(resultJson: String): String {
        val payload = buildJsonObject {
            put("rp_id", _state.value.rpId)
            put(
                key = "devPortalPayload",
                element = json.decodeFromString(deserializer = JsonObject.serializer(), string = resultJson),
            )
        }
        val response = http.post(urlString = verifyEndpoint) {
            contentType(ContentType.Application.Json)
            setBody(payload.toString())
        }
        val body = response.bodyAsText()
        check(value = response.status.isSuccess()) { "Verify failed (${response.status.value}): $body" }
        return body
    }

    private fun log(message: String) {
        _state.update { it.copy(logs = it.logs + "$message\n") }
    }
}
