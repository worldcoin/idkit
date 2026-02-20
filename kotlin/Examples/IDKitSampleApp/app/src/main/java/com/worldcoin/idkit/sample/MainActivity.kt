package com.worldcoin.idkit.sample

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.worldcoin.idkit.IDKit
import com.worldcoin.idkit.IDKitRequest
import com.worldcoin.idkit.IDKitRequestConfig
import com.worldcoin.idkit.idkitResultToJson
import com.worldcoin.idkit.orbLegacy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import uniffi.idkit_core.Environment
import uniffi.idkit_core.RpContext

class MainActivity : ComponentActivity() {
    private val model = SampleModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        handleIntent(intent)

        setContent {
            SampleScreen(
                model = model,
                onOpenConnector = { url ->
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        model.clear()
    }

    override fun onStart() {
        super.onStart()
        model.setAppForeground(true)
    }

    override fun onStop() {
        model.setAppForeground(false)
        super.onStop()
    }

    private fun handleIntent(intent: Intent?) {
        val callbackUrl = intent?.data?.toString() ?: return
        model.handleDeepLink(callbackUrl)
    }
}

@Composable
private fun SampleScreen(
    model: SampleModel,
    onOpenConnector: (String) -> Unit,
) {
    val connectorURI = model.connectorURI

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("IDKit Sample", style = MaterialTheme.typography.headlineSmall)

                Text("Request", style = MaterialTheme.typography.titleMedium)
                FormField("App ID", model.appId, enabled = false) { model.appId = it }
                FormField("RP ID", model.rpId, enabled = false) { model.rpId = it }
                FormField("Action", model.action) { model.action = it }
                FormField("Signal", model.signal) { model.signal = it }
                EnvironmentSelector(
                    selected = model.environment,
                    onSelect = { model.environment = it },
                )

                Button(
                    onClick = { model.generateRequestURL() },
                    enabled = !model.isLoading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (model.isLoading) "Generating..." else "Generate Connector URL")
                }

                if (connectorURI != null) {
                    Text("Connector URL", style = MaterialTheme.typography.titleMedium)
                    Button(
                        onClick = { onOpenConnector(connectorURI) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Open Connector URL")
                    }
                    SelectionContainer {
                        Text(connectorURI, fontFamily = FontFamily.Monospace)
                    }
                }

                Text("Logs", style = MaterialTheme.typography.titleMedium)
                SelectionContainer {
                    Text(
                        text = if (model.logs.isBlank()) "No logs yet." else model.logs,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 180.dp)
                            .border(1.dp, MaterialTheme.colorScheme.outline)
                            .padding(12.dp),
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
        }
    }
}

@Composable
private fun FormField(
    label: String,
    value: String,
    enabled: Boolean = true,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = true,
    )
}

@Composable
private fun EnvironmentSelector(
    selected: SampleEnvironment,
    onSelect: (SampleEnvironment) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Environment", style = MaterialTheme.typography.labelLarge)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (selected == SampleEnvironment.PRODUCTION) {
                FilledTonalButton(
                    onClick = {},
                    modifier = Modifier.weight(1f),
                ) {
                    Text("production")
                }
            } else {
                OutlinedButton(
                    onClick = { onSelect(SampleEnvironment.PRODUCTION) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("production")
                }
            }

            if (selected == SampleEnvironment.STAGING) {
                FilledTonalButton(
                    onClick = {},
                    modifier = Modifier.weight(1f),
                ) {
                    Text("staging")
                }
            } else {
                OutlinedButton(
                    onClick = { onSelect(SampleEnvironment.STAGING) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("staging")
                }
            }
        }
    }
}

private enum class SampleEnvironment {
    PRODUCTION,
    STAGING,
}

private class SampleModel {
    var signatureEndpoint by mutableStateOf("http://localhost:3001/api/rp-signature")
    var verifyEndpoint by mutableStateOf("http://localhost:3001/api/verify-proof")
    var appId by mutableStateOf("app_982a2852d071269417befc64ab3981c2")
    var rpId by mutableStateOf("rp_45a9b5d97996bb9a")
    var action by mutableStateOf("test-action")
    var signal by mutableStateOf("signal")
    var environment by mutableStateOf(SampleEnvironment.PRODUCTION)
    private val returnToURL = "idkitsample://callback"
    var connectorURI by mutableStateOf<String?>(null)
    var logs by mutableStateOf("")
    var isLoading by mutableStateOf(false)

    private val client = OkHttpClient()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var pendingRequest: IDKitRequest? = null
    private var completionJob: Job? = null
    private var pollingRequestId: String? = null
    private var deepLinkReceivedForPendingRequest: Boolean = false
    private var appIsForeground: Boolean = false

    fun clear() {
        scope.cancel()
    }

    fun setAppForeground(isForeground: Boolean) {
        appIsForeground = isForeground
        log("App state changed: foreground=$appIsForeground")
    }

    fun generateRequestURL() {
        scope.launch {
            isLoading = true
            try {
                log("Fetching RP signature from $signatureEndpoint")
                val signaturePayload = fetchSignaturePayload()

                val rpContext = RpContext(
                    rpId = rpId,
                    nonce = signaturePayload.nonce,
                    createdAt = signaturePayload.createdAt.toULong(),
                    expiresAt = signaturePayload.expiresAt.toULong(),
                    signature = signaturePayload.sig,
                )

                val config = IDKitRequestConfig(
                    appId = appId,
                    action = action,
                    rpContext = rpContext,
                    actionDescription = "Local Android sample",
                    bridgeUrl = null,
                    allowLegacyProofs = false,
                    overrideConnectBaseUrl = null,
                    environment = when (environment) {
                        SampleEnvironment.PRODUCTION -> Environment.PRODUCTION
                        SampleEnvironment.STAGING -> Environment.STAGING
                    },
                )

                val request = IDKit
                    .request(config)
                    .preset(orbLegacy(signal = signal))

                completionJob?.cancel()
                val connectorWithReturnTo = addReturnTo(request.connectorURI)
                connectorURI = connectorWithReturnTo
                pendingRequest = request
                deepLinkReceivedForPendingRequest = false

                android.util.Log.i("IDKitSample", "IDKit connector URL: $connectorWithReturnTo")
                log("Generated request ID: ${request.requestId}")
                log("Added return_to callback: $returnToURL")
                startPollingForRequest(
                    request = request,
                    reason = "request generation",
                )
            } catch (error: Throwable) {
                log("Error: ${error.message ?: error::class.simpleName}")
            } finally {
                isLoading = false
            }
        }
    }

    fun handleDeepLink(url: String) {
        android.util.Log.i("IDKitSample", "IDKit deep link callback: $url")
        log("Received deep link callback: $url")
        val request = pendingRequest
        if (request == null) {
            log("No pending request found. Generate a connector URL first.")
            return
        }

        deepLinkReceivedForPendingRequest = true

        if (completionJob?.isActive == true && pollingRequestId == request.requestId) {
            log("Polling already running for request ${request.requestId}.")
            return
        }

        startPollingForRequest(
            request = request,
            reason = "deep link callback",
        )
    }

    private fun startPollingForRequest(request: IDKitRequest, reason: String) {
        if (completionJob?.isActive == true && pollingRequestId == request.requestId) {
            return
        }

        completionJob?.cancel()
        pollingRequestId = request.requestId
        log("Started polling for request ${request.requestId} (trigger: $reason).")

        completionJob = scope.launch {
            try {
                val pollIntervalMs = 2_000L
                val timeoutMs = 180_000L
                val startedAt = System.currentTimeMillis()

                while (true) {
                    if (pollingRequestId != request.requestId) {
                        return@launch
                    }

                    if (System.currentTimeMillis() - startedAt >= timeoutMs) {
                        log("Proof completion failed: timeout")
                        return@launch
                    }

                    when (val status = request.pollStatusOnce()) {
                        is com.worldcoin.idkit.IDKitStatus.Confirmed -> {
                            if (pollingRequestId != request.requestId) {
                                return@launch
                            }

                            pendingRequest = null
                            deepLinkReceivedForPendingRequest = false

                            try {
                                log("Proof confirmed. Calling verify endpoint: $verifyEndpoint")
                                val verifyResult = verifyProof(status.result)
                                android.util.Log.i("IDKitSample", "IDKit verify result: $verifyResult")
                                log("Verify response: $verifyResult")
                            } catch (error: Throwable) {
                                log("Verify request failed: ${error.message ?: error::class.simpleName}")
                            }
                            return@launch
                        }

                        is com.worldcoin.idkit.IDKitStatus.Failed -> {
                            if (status.error == com.worldcoin.idkit.IDKitErrorCode.CONNECTION_FAILED) {
                                log(
                                    "Bridge poll returned connection_failed " +
                                        "(foreground=$appIsForeground, deepLinkReceived=$deepLinkReceivedForPendingRequest).",
                                )
                            }

                            val shouldRetryConnectionFailure =
                                status.error == com.worldcoin.idkit.IDKitErrorCode.CONNECTION_FAILED &&
                                    !deepLinkReceivedForPendingRequest &&
                                    pendingRequest?.requestId == request.requestId

                            if (shouldRetryConnectionFailure) {
                                log("Bridge not ready yet (connection_failed). Retrying...")
                                delay(pollIntervalMs)
                                continue
                            }

                            log("Proof completion failed: ${status.error.rawValue}")
                            return@launch
                        }

                        com.worldcoin.idkit.IDKitStatus.AwaitingConfirmation,
                        com.worldcoin.idkit.IDKitStatus.WaitingForConnection -> {
                            delay(pollIntervalMs)
                        }
                    }
                }
            } catch (error: Throwable) {
                if (pollingRequestId == request.requestId) {
                    log("Polling error: ${error.message ?: error::class.simpleName}")
                }
            } finally {
                if (pollingRequestId == request.requestId) {
                    pollingRequestId = null
                }
            }
        }
    }

    private suspend fun fetchSignaturePayload(): SignaturePayload = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("action", action)
        val requestBody = payload
            .toString()
            .toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(signatureEndpoint)
            .post(requestBody)
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw SampleException.BadResponse(response.code, body)
            }

            val json = JSONObject(body)
            SignaturePayload(
                sig = json.getString("sig"),
                nonce = json.getString("nonce"),
                createdAt = json.getLong("created_at"),
                expiresAt = json.getLong("expires_at"),
            )
        }
    }

    private suspend fun verifyProof(result: com.worldcoin.idkit.IDKitResult): String = withContext(Dispatchers.IO) {
        val payloadObject = JSONObject(idkitResultToJson(result))
        val requestObject = JSONObject()
            .put("rp_id", rpId)
            .put("devPortalPayload", payloadObject)

        val request = Request.Builder()
            .url(verifyEndpoint)
            .post(requestObject.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val pretty = prettifyJSON(body)
            if (!response.isSuccessful) {
                throw SampleException.VerifyFailed(response.code, pretty)
            }
            pretty
        }
    }

    private fun addReturnTo(connectorUrl: String): String {
        val trimmedReturnTo = returnToURL.trim()
        if (trimmedReturnTo.isEmpty()) {
            return connectorUrl
        }

        val parsedReturnTo = Uri.parse(trimmedReturnTo)
        if (parsedReturnTo.scheme.isNullOrBlank()) {
            throw SampleException.InvalidReturnToURL(trimmedReturnTo)
        }

        val connectorUri = Uri.parse(connectorUrl)
        val existingQuery = mutableListOf<Pair<String, String?>>()
        for (name in connectorUri.queryParameterNames) {
            if (name == "return_to") continue
            connectorUri.getQueryParameters(name).forEach { value ->
                existingQuery += name to value
            }
        }

        val builder = connectorUri.buildUpon().clearQuery()
        existingQuery.forEach { (name, value) ->
            builder.appendQueryParameter(name, value)
        }
        builder.appendQueryParameter("return_to", trimmedReturnTo)

        return builder.build().toString()
    }

    private fun prettifyJSON(raw: String): String {
        return runCatching { JSONObject(raw).toString(2) }
            .recoverCatching { JSONArray(raw).toString(2) }
            .getOrElse { raw }
    }

    private fun log(message: String) {
        val timestamp = java.time.Instant.now().toString()
        logs += "[$timestamp] $message\n"
    }
}

private data class SignaturePayload(
    val sig: String,
    val nonce: String,
    val createdAt: Long,
    val expiresAt: Long,
)

private sealed class SampleException(message: String) : IllegalStateException(message) {
    class InvalidReturnToURL(raw: String) : SampleException("Invalid return_to URL: $raw")
    class BadResponse(statusCode: Int, body: String) :
        SampleException("Backend request failed ($statusCode): $body")

    class VerifyFailed(statusCode: Int, body: String) :
        SampleException("Verify failed ($statusCode): $body")
}
