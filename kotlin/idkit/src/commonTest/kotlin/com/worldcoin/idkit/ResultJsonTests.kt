package com.worldcoin.idkit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ResultJsonTests {

    @Test
    fun parsesV3Result() {
        val result = idkitResultFromJson(SAMPLE_V3_RESULT_JSON)

        assertEquals("3.0", result.protocolVersion)
        assertEquals("0x01", result.nonce)
        assertEquals("test-action", result.action)
        assertNull(result.sessionId)
        assertEquals(true, result.userPresenceCompleted)
        assertEquals("staging", result.environment)

        val item = assertIs<ResponseItem.V3>(result.responses.single())
        assertEquals("proof_of_human", item.identifier)
        assertEquals("0xabcd", item.proof)
        assertEquals("0x1234", item.merkleRoot)
        assertEquals("0x5678", item.nullifier)
    }

    @Test
    fun parsesV4AndSessionItems() {
        val json = """
            {
              "protocol_version": "4.0",
              "nonce": "0x02",
              "session_id": "session_00ff",
              "responses": [
                {
                  "identifier": "passport",
                  "issuer_schema_id": 9303,
                  "proof": ["0x01", "0x02", "0x03", "0x04", "0x05"],
                  "nullifier": "0xaa",
                  "expires_at_min": 1700003600
                },
                {
                  "identifier": "proof_of_human",
                  "issuer_schema_id": 1,
                  "proof": ["0x01"],
                  "session_nullifier": ["0xbb", "0xcc"],
                  "expires_at_min": 1700003600
                }
              ],
              "user_presence_completed": false,
              "environment": "production",
              "identity_attested": true,
              "integrity_bundle": {
                "version": 1,
                "signature_format": "apple_app_attest",
                "timestamp": 1700000100,
                "signature": "0xdd",
                "jwt": "ey.."
              }
            }
        """.trimIndent()

        val result = idkitResultFromJson(json)

        assertEquals("session_00ff", result.sessionId)
        assertEquals(true, result.identityAttested)
        assertEquals("apple_app_attest", result.integrityBundle?.signatureFormat)

        val v4 = assertIs<ResponseItem.V4>(result.responses[0])
        assertEquals(9303uL, v4.issuerSchemaId)
        assertEquals(5, v4.proof.size)

        val session = assertIs<ResponseItem.Session>(result.responses[1])
        assertEquals(listOf("0xbb", "0xcc"), session.sessionNullifier)
    }

    @Test
    fun rawJsonIsPreservedVerbatim() {
        // The raw wire form (including any fields this SDK does not model)
        // must be forwarded unchanged to backend verification endpoints.
        val jsonWithUnknownField = SAMPLE_V3_RESULT_JSON.replace(
            "\"protocol_version\": \"3.0\",",
            "\"protocol_version\": \"3.0\",\n  \"future_field\": {\"a\": 1},",
        )
        val result = idkitResultFromJson(jsonWithUnknownField)

        assertEquals(jsonWithUnknownField, result.rawJson)
        assertEquals(jsonWithUnknownField, idkitResultToJson(result))
        assertTrue(idkitResultToJson(result).contains("future_field"))
    }

    @Test
    fun equalityIsStructural() {
        assertEquals(idkitResultFromJson(SAMPLE_V3_RESULT_JSON), sampleResult())
    }
}
