package com.worldcoin.idkit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import uniffi.idkit_core.AppError
import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.Environment
import uniffi.idkit_core.Preset
import uniffi.idkit_core.ResponseItem
import uniffi.idkit_core.RpContext
import uniffi.idkit_core.StatusWrapper

class IDKitTests {
    private fun sampleResult(sessionId: String? = null): IDKitResult =
        IDKitResult(
            protocolVersion = "4.0",
            nonce = "0x1234",
            action = if (sessionId == null) "login" else null,
            actionDescription = "Sample action",
            sessionId = sessionId,
            responses = emptyList<ResponseItem>(),
            environment = "production",
        )

    private fun sampleRpContext(): RpContext {
        val signature = "0x" + "00".repeat(64) + "1b"
        return RpContext(
            rpId = "rp_1234567890abcdef",
            nonce = "0x0000000000000000000000000000000000000000000000000000000000000001",
            createdAt = 1_700_000_000u,
            expiresAt = 1_700_003_600u,
            signature = signature,
        )
    }

    @Test
    fun `IDKit entrypoints expose canonical builders`() {
        val requestConfig = IDKitRequestConfig(
            appId = "app_staging_1234567890abcdef",
            action = "login",
            rpContext = sampleRpContext(),
            actionDescription = null,
            bridgeUrl = null,
            allowLegacyProofs = false,
            overrideConnectBaseUrl = null,
            environment = Environment.STAGING,
        )

        val sessionConfig = IDKitSessionConfig(
            appId = "app_staging_1234567890abcdef",
            rpContext = sampleRpContext(),
            actionDescription = null,
            bridgeUrl = null,
            overrideConnectBaseUrl = null,
            environment = Environment.STAGING,
        )

        IDKit.request(requestConfig)
        IDKit.createSession(sessionConfig)
        IDKit.proveSession("0x01", sessionConfig)
    }

    @Test
    fun `status mapping covers all canonical variants`() {
        val result = sampleResult()

        assertEquals(
            IDKitStatus.WaitingForConnection,
            IDKitRequest.mapStatus(StatusWrapper.WaitingForConnection),
        )
        assertEquals(
            IDKitStatus.AwaitingConfirmation,
            IDKitRequest.mapStatus(StatusWrapper.AwaitingConfirmation),
        )
        assertEquals(
            IDKitStatus.Confirmed(result),
            IDKitRequest.mapStatus(StatusWrapper.Confirmed(result)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.INVALID_NETWORK),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.INVALID_NETWORK)),
        )
    }

    @Test
    fun `pollUntilCompletion success path`() = runBlocking {
        val statuses = ArrayDeque(
            listOf(
                IDKitStatus.WaitingForConnection,
                IDKitStatus.AwaitingConfirmation,
                IDKitStatus.Confirmed(sampleResult()),
            ),
        )

        val request = IDKitRequest.forTesting(
            connectorURI = "https://world.org/verify?t=wld",
            requestId = "7a6ff287-c95f-4330-b3de-9447f77ca3f9",
        ) {
            statuses.removeFirstOrNull() ?: IDKitStatus.WaitingForConnection
        }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 1u, timeoutMs = 1_000u))
        assertEquals(IDKitCompletionResult.Success(sampleResult()), completion)
    }

    @Test
    fun `pollUntilCompletion timeout path`() = runBlocking {
        val request = IDKitRequest.forTesting(
            connectorURI = "https://world.org/verify?t=wld",
            requestId = "7a6ff287-c95f-4330-b3de-9447f77ca3f9",
        ) {
            IDKitStatus.WaitingForConnection
        }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 5u, timeoutMs = 20u))
        assertEquals(IDKitCompletionResult.Failure(IDKitErrorCode.TIMEOUT), completion)
    }

    @Test
    fun `pollUntilCompletion cancellation path`() = runBlocking {
        val request = IDKitRequest.forTesting(
            connectorURI = "https://world.org/verify?t=wld",
            requestId = "7a6ff287-c95f-4330-b3de-9447f77ca3f9",
        ) {
            throw CancellationException("test cancellation")
        }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 200u, timeoutMs = 10_000u))
        assertEquals(IDKitCompletionResult.Failure(IDKitErrorCode.CANCELLED), completion)
    }

    @Test
    fun `pollUntilCompletion app failure path`() = runBlocking {
        val request = IDKitRequest.forTesting(
            connectorURI = "https://world.org/verify?t=wld",
            requestId = "7a6ff287-c95f-4330-b3de-9447f77ca3f9",
        ) {
            IDKitStatus.Failed(IDKitErrorCode.USER_REJECTED)
        }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 1u, timeoutMs = 1_000u))
        assertEquals(IDKitCompletionResult.Failure(IDKitErrorCode.USER_REJECTED), completion)
    }

    @Test
    fun `hashSignal string and bytes overloads are deterministic`() {
        val raw = "test-signal"
        val hashFromString = IDKit.hashSignal(raw)
        val hashFromBytes = IDKit.hashSignal(raw.toByteArray())

        assertEquals(hashFromString, hashFromBytes)
        assertTrue(hashFromString.startsWith("0x"))
        assertTrue(hashFromString.isNotEmpty())
    }

    @Test
    fun `CredentialRequest signal-only options`() {
        val request = CredentialRequest(
            CredentialType.ORB,
            options = CredentialRequestOptions(signal = "user-123"),
        )

        assertEquals(CredentialType.ORB, request.credentialType())
        assertEquals("user-123", request.getSignalBytes()!!.toString(Charsets.UTF_8))
        assertEquals(null, request.genesisIssuedAtMin())
        assertEquals(null, request.expiresAtMin())
    }

    @Test
    fun `CredentialRequest genesis-only options`() {
        val request = CredentialRequest(
            CredentialType.ORB,
            options = CredentialRequestOptions(genesisIssuedAtMin = 1_700_000_000u),
        )

        assertEquals(1_700_000_000u, request.genesisIssuedAtMin())
        assertEquals(null, request.expiresAtMin())
    }

    @Test
    fun `CredentialRequest expiry-only options`() {
        val request = CredentialRequest(
            CredentialType.ORB,
            options = CredentialRequestOptions(expiresAtMin = 1_800_000_000u),
        )

        assertEquals(null, request.genesisIssuedAtMin())
        assertEquals(1_800_000_000u, request.expiresAtMin())
    }

    @Test
    fun `CredentialRequest combined options`() {
        val request = CredentialRequest(
            CredentialType.ORB,
            options = CredentialRequestOptions(
                signal = "user-123",
                genesisIssuedAtMin = 1_700_000_000u,
                expiresAtMin = 1_800_000_000u,
            ),
        )

        assertEquals(CredentialType.ORB, request.credentialType())
        assertEquals("user-123", request.getSignalBytes()!!.toString(Charsets.UTF_8))
        assertEquals(1_700_000_000u, request.genesisIssuedAtMin())
        assertEquals(1_800_000_000u, request.expiresAtMin())
    }

    @Test
    fun `legacy preset helpers remain available`() {
        val orb = orbLegacy(signal = "x")
        val secureDoc = secureDocumentLegacy(signal = "y")
        val doc = documentLegacy(signal = "z")

        assertTrue(orb is Preset.OrbLegacy)
        assertTrue(secureDoc is Preset.SecureDocumentLegacy)
        assertTrue(doc is Preset.DocumentLegacy)
        assertEquals("x", (orb as Preset.OrbLegacy).signal)
        assertEquals("y", (secureDoc as Preset.SecureDocumentLegacy).signal)
        assertEquals("z", (doc as Preset.DocumentLegacy).signal)
    }

    @Test
    fun `idkit result json helpers roundtrip`() {
        val input = sampleResult()
        val json = idkitResultToJson(input)
        val output = idkitResultFromJson(json)

        assertEquals(input, output)
        assertNotEquals("", json)
    }
}
