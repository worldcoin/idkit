package com.worldcoin.idkit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Contract tests that exercise the real Rust core through the C ABI. They
 * require the native artifacts from `scripts/build-kotlin.sh`:
 * host `libidkit_kmp.dylib/.so` for JVM unit tests (via `jna.library.path`),
 * and the statically linked `libidkit_kmp.a` for iOS simulator tests.
 */
class NativeContractTests {

    @Test
    fun bridgePayloadFromIdentityCheckPresetExposesContractFields() {
        val payload = IDKit.createBridgePayloadFromPresets(
            config = sampleRequestConfig(),
            preset = identityCheck(
                attributes = listOf(
                    IdentityAttribute.MinimumAge(21u),
                    IdentityAttribute.Nationality("JPN"),
                ),
            ),
        )

        assertEquals("app_staging_1234567890abcdef", payload.appId)
        assertEquals("idkit_kotlin", payload.packageName)
        assertEquals(IDKit.version, payload.packageVersion)
        assertEquals("test-action", payload.action)
        assertEquals("Identity check", payload.actionDescription)
        assertEquals(VerificationLevel.DOCUMENT, payload.verificationLevel)
        assertEquals(true, payload.requireUserPresence)
        // IdentityCheck overrides allowLegacyProofs to true.
        assertEquals(true, payload.allowLegacyProofs)
        assertEquals("idkitsample://callback", payload.returnToUrl)
        assertEquals(Environment.STAGING, payload.environment)
        assertNull(payload.timestamp)

        assertEquals(
            listOf(
                IdentityAttribute.MinimumAge(21u),
                IdentityAttribute.Nationality("JPN"),
            ),
            payload.identityAttributes,
        )

        val proofRequest = assertNotNull(payload.proofRequest)
        assertEquals(1, proofRequest.version)
        assertEquals("uniqueness", proofRequest.proofType)
        assertEquals("rp_1234567890abcdef", proofRequest.rpId)
        assertEquals(1_700_000_000uL, proofRequest.createdAt)
        assertEquals(1_700_003_600uL, proofRequest.expiresAt)
        assertTrue(proofRequest.id.isNotEmpty())

        assertEquals(listOf("passport", "mnc"), payload.credentialIdentifiers)
    }

    @Test
    fun bridgePayloadFromConstraintsExposesPassportOrMnc() {
        val payload = IDKit.createBridgePayloadFromConstraints(
            config = sampleRequestConfig(),
            constraints = anyOf(
                CredentialRequest(CredentialType.PASSPORT),
                CredentialRequest(CredentialType.MNC),
            ),
        )

        // Constraint requests keep DEVICE for v3 parser compatibility; real
        // selection lives in the proof request.
        assertEquals(VerificationLevel.DEVICE, payload.verificationLevel)
        assertEquals(false, payload.allowLegacyProofs)
        assertEquals(listOf("passport", "mnc"), payload.credentialIdentifiers)
    }

    @Test
    fun invalidAppIdSurfacesAsIDKitException() {
        val exception = assertFailsWith<IDKitException> {
            IDKit.createBridgePayloadFromPresets(
                config = sampleRequestConfig().copy(appId = "bogus"),
                preset = orbLegacy(),
            )
        }
        assertEquals("malformed_request", exception.code)
    }

    @Test
    fun blankInputsSurfaceAsClientErrors() {
        assertFailsWith<IDKitClientError> {
            IDKit.request(sampleRequestConfig().copy(appId = " "))
        }
        assertFailsWith<IDKitClientError> {
            IDKit.request(sampleRequestConfig().copy(action = ""))
        }
    }

    @Test
    fun hashSignalStringAndBytesOverloadsAreDeterministic() {
        val raw = "test-signal"
        val hashFromString = IDKit.hashSignal(raw)
        val hashFromBytes = IDKit.hashSignal(raw.encodeToByteArray())

        assertEquals(hashFromString, hashFromBytes)
        assertTrue(hashFromString.startsWith("0x"))
        assertEquals(66, hashFromString.length)
        assertEquals(hashFromString, IDKit.hashSignal(raw))
    }
}
