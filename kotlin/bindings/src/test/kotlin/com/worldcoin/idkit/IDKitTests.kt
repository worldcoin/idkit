package com.worldcoin.idkit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import uniffi.idkit_core.AppError
import uniffi.idkit_core.ConnectUrlMode
// TODO: Re-enable when World ID 4.0 is live
// import uniffi.idkit_core.CredentialType
import uniffi.idkit_core.DocumentType
import uniffi.idkit_core.Environment
import uniffi.idkit_core.IdentityAttribute
import uniffi.idkit_core.Preset
import uniffi.idkit_core.ResponseItem
import uniffi.idkit_core.RpContext
import uniffi.idkit_core.StatusWrapper

class IDKitTests {
    private fun sampleResult(
        sessionId: String? = null,
        userPresenceCompleted: Boolean = false,
    ): IDKitResult =
        IDKitResult(
            protocolVersion = "4.0",
            nonce = "0x1234",
            action = if (sessionId == null) "login" else null,
            actionDescription = "Sample action",
            sessionId = sessionId,
            responses = emptyList<ResponseItem>(),
            userPresenceCompleted = userPresenceCompleted,
            environment = "production",
            identityAttested = null,
            integrityBundle = null,
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
            requireUserPresence = false,
            overrideConnectBaseUrl = null,
            returnTo = null,
            environment = Environment.STAGING,
            connectUrlMode = ConnectUrlMode.DEFAULT,
        )

        // TODO: Re-enable when World ID 4.0 is live
        // val sessionConfig = IDKitSessionConfig(
        //     appId = "app_staging_1234567890abcdef",
        //     rpContext = sampleRpContext(),
        //     actionDescription = null,
        //     bridgeUrl = null,
        //     requireUserPresence = false,
        //     overrideConnectBaseUrl = null,
        //     returnTo = null,
        //     environment = Environment.STAGING,
        // )

        IDKit.request(requestConfig)
        // TODO: Re-enable when World ID 4.0 is live
        // IDKit.createSession(sessionConfig)
        // IDKit.proveSession("0x01", sessionConfig)
    }

    @Test
    fun `bridge debug payload JSON exposes identity check contract fields`() {
        val builder = IDKit.request(
            IDKitRequestConfig(
                appId = "app_staging_1234567890abcdef",
                action = "test-action",
                rpContext = sampleRpContext(),
                actionDescription = "Identity check",
                bridgeUrl = null,
                allowLegacyProofs = false,
                requireUserPresence = true,
                overrideConnectBaseUrl = null,
                returnTo = "idkitsample://callback",
                environment = Environment.STAGING,
                connectUrlMode = null,
            ),
        )

        val payload = Json.parseToJsonElement(
            builder.bridgeDebugPayloadJsonFromPreset(
                identityCheck(
                    attributes = listOf(
                        IdentityAttribute.MinimumAge(21u),
                        IdentityAttribute.Nationality("JPN"),
                    ),
                ),
            ),
        ).jsonObject

        assertEquals("app_staging_1234567890abcdef", payload["app_id"]?.jsonPrimitive?.content)
        assertEquals("test-action", payload["action"]?.jsonPrimitive?.content)
        assertEquals("Identity check", payload["action_description"]?.jsonPrimitive?.content)
        assertEquals("document", payload["verification_level"]?.jsonPrimitive?.content)
        assertEquals(true, payload["require_user_presence"]?.jsonPrimitive?.boolean)
        assertEquals(true, payload["allow_legacy_proofs"]?.jsonPrimitive?.boolean)
        assertEquals("idkitsample://callback", payload["return_to_url"]?.jsonPrimitive?.content)
        assertEquals("staging", payload["environment"]?.jsonPrimitive?.content)
        assertNull(payload["timestamp"])

        val attributes = payload["identity_attributes"]!!.jsonArray
        assertEquals(2, attributes.size)
        assertEquals("minimum_age", attributes[0].jsonObject["type"]?.jsonPrimitive?.content)
        assertEquals(21, attributes[0].jsonObject["value"]?.jsonPrimitive?.int)
        assertEquals("nationality", attributes[1].jsonObject["type"]?.jsonPrimitive?.content)
        assertEquals("JPN", attributes[1].jsonObject["value"]?.jsonPrimitive?.content)

        val proofRequest = payload["proof_request"]!!.jsonObject
        assertEquals("uniqueness", proofRequest["proof_type"]?.jsonPrimitive?.content)
        assertEquals("rp_1234567890abcdef", proofRequest["rp_id"]?.jsonPrimitive?.content)
        assertEquals(1_700_000_000, proofRequest["created_at"]?.jsonPrimitive?.int)
        assertEquals(1_700_003_600, proofRequest["expires_at"]?.jsonPrimitive?.int)
        assertTrue(proofRequest["id"]?.jsonPrimitive?.content?.isNotEmpty() == true)

        val proofRequests = proofRequest["proof_requests"]!!.jsonArray
        assertEquals(
            listOf("passport", "mnc"),
            proofRequests.map { it.jsonObject["identifier"]?.jsonPrimitive?.content },
        )
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
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.USER_PRESENCE_FAILED),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.USER_PRESENCE_FAILED)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.INVALID_RP_SIGNATURE),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.INVALID_RP_SIGNATURE)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.NULLIFIER_REPLAYED),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.NULLIFIER_REPLAYED)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.DUPLICATE_NONCE),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.DUPLICATE_NONCE)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.UNKNOWN_RP),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.UNKNOWN_RP)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.INACTIVE_RP),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.INACTIVE_RP)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.TIMESTAMP_TOO_OLD),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.TIMESTAMP_TOO_OLD)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.TIMESTAMP_TOO_FAR_IN_FUTURE),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.TIMESTAMP_TOO_FAR_IN_FUTURE)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.INVALID_TIMESTAMP),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.INVALID_TIMESTAMP)),
        )
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.RP_SIGNATURE_EXPIRED),
            IDKitRequest.mapStatus(StatusWrapper.Failed(AppError.RP_SIGNATURE_EXPIRED)),
        )
        assertEquals(
            IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
            IDKitRequest.mapStatus(StatusWrapper.NetworkingError(AppError.CONNECTION_FAILED)),
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
    fun `pollUntilCompletion recovers from networking errors`() = runBlocking {
        val statuses = ArrayDeque(
            listOf(
                IDKitStatus.WaitingForConnection,
                IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
                IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
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

    // TODO: Re-enable when World ID 4.0 is live
    // @Test
    // fun `CredentialRequest signal-only options`() {
    //     val request = CredentialRequest(
    //         CredentialType.ORB,
    //         options = CredentialRequestOptions(signal = "user-123"),
    //     )
    //
    //     assertEquals(CredentialType.ORB, request.credentialType())
    //     assertEquals("user-123", request.getSignalBytes()!!.toString(Charsets.UTF_8))
    //     assertEquals(null, request.genesisIssuedAtMin())
    //     assertEquals(null, request.expiresAtMin())
    // }

    // @Test
    // fun `CredentialRequest genesis-only options`() {
    //     val request = CredentialRequest(
    //         CredentialType.ORB,
    //         options = CredentialRequestOptions(genesisIssuedAtMin = 1_700_000_000u),
    //     )
    //
    //     assertEquals(1_700_000_000u, request.genesisIssuedAtMin())
    //     assertEquals(null, request.expiresAtMin())
    // }

    // @Test
    // fun `CredentialRequest expiry-only options`() {
    //     val request = CredentialRequest(
    //         CredentialType.ORB,
    //         options = CredentialRequestOptions(expiresAtMin = 1_800_000_000u),
    //     )
    //
    //     assertEquals(null, request.genesisIssuedAtMin())
    //     assertEquals(1_800_000_000u, request.expiresAtMin())
    // }

    // @Test
    // fun `CredentialRequest combined options`() {
    //     val request = CredentialRequest(
    //         CredentialType.ORB,
    //         options = CredentialRequestOptions(
    //             signal = "user-123",
    //             genesisIssuedAtMin = 1_700_000_000u,
    //             expiresAtMin = 1_800_000_000u,
    //         ),
    //     )
    //
    //     assertEquals(CredentialType.ORB, request.credentialType())
    //     assertEquals("user-123", request.getSignalBytes()!!.toString(Charsets.UTF_8))
    //     assertEquals(1_700_000_000u, request.genesisIssuedAtMin())
    //     assertEquals(1_800_000_000u, request.expiresAtMin())
    // }

    @Test
    fun `legacy preset helpers remain available`() {
        val orb = orbLegacy(signal = "x")
        val secureDoc = secureDocumentLegacy(signal = "y")
        val doc = documentLegacy(signal = "z")
        val device = deviceLegacy(signal = "d")
        val face = selfieCheckLegacy(signal = "f")

        assertTrue(orb is Preset.OrbLegacy)
        assertTrue(secureDoc is Preset.SecureDocumentLegacy)
        assertTrue(doc is Preset.DocumentLegacy)
        assertTrue(device is Preset.DeviceLegacy)
        assertTrue(face is Preset.SelfieCheckLegacy)
        assertEquals("x", (orb).signal)
        assertEquals("y", (secureDoc).signal)
        assertEquals("z", (doc).signal)
        assertEquals("d", (device).signal)
        assertEquals("f", (face).signal)
    }

    @Test
    fun `identityCheck helper exposes canonical preset`() {
        val attributes = listOf(
            IdentityAttribute.MinimumAge(21u),
            IdentityAttribute.Nationality("JPN"),
            IdentityAttribute.DocumentType(DocumentType.PASSPORT),
        )

        val preset = identityCheck(attributes = attributes)

        assertTrue(preset is Preset.IdentityCheck)
        assertEquals(attributes, preset.attributes)
        assertNull(preset.legacySignal)
    }

    @Test
    fun `identityCheck helper preserves legacySignal`() {
        val attributes = listOf(IdentityAttribute.MinimumAge(18u))

        val preset = identityCheck(attributes = attributes, legacySignal = "my-signal")

        assertTrue(preset is Preset.IdentityCheck)
        assertEquals("my-signal", preset.legacySignal)
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
