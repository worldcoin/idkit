package com.worldcoin.idkit

import com.worldcoin.idkit.internal.IdKitJson
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Golden-JSON tests: the encoded forms must match the Rust core's serde
 * schemas exactly (Preset tag="type" PascalCase, IdentityAttribute
 * {"type","value"}, ConstraintNode untagged, config DTO snake_case).
 */
class SerializationTests {

    private fun assertJsonEquals(expected: String, actual: String) {
        assertEquals(IdKitJson.parseToJsonElement(expected), IdKitJson.parseToJsonElement(actual))
    }

    @Test
    fun presetsEncodeToCoreSchema() {
        assertJsonEquals(
            """{"type":"OrbLegacy","signal":"sig"}""",
            IdKitJson.encodeToString(Preset.serializer(), orbLegacy("sig")),
        )
        assertJsonEquals(
            """{"type":"OrbLegacy"}""",
            IdKitJson.encodeToString(Preset.serializer(), orbLegacy()),
        )
        assertJsonEquals(
            """{"type":"SecureDocumentLegacy"}""",
            IdKitJson.encodeToString(Preset.serializer(), secureDocumentLegacy()),
        )
        assertJsonEquals(
            """{"type":"DocumentLegacy"}""",
            IdKitJson.encodeToString(Preset.serializer(), documentLegacy()),
        )
        assertJsonEquals(
            """{"type":"DeviceLegacy"}""",
            IdKitJson.encodeToString(Preset.serializer(), deviceLegacy()),
        )
        assertJsonEquals(
            """{"type":"SelfieCheckLegacy"}""",
            IdKitJson.encodeToString(Preset.serializer(), selfieCheckLegacy()),
        )
        assertJsonEquals(
            """
            {
              "type": "IdentityCheck",
              "attributes": [
                {"type": "minimum_age", "value": 21},
                {"type": "nationality", "value": "JPN"},
                {"type": "document_type", "value": "passport"}
              ]
            }
            """.trimIndent(),
            IdKitJson.encodeToString(
                Preset.serializer(),
                identityCheck(
                    attributes = listOf(
                        IdentityAttribute.MinimumAge(21u),
                        IdentityAttribute.Nationality("JPN"),
                        IdentityAttribute.DocumentType(DocumentType.PASSPORT),
                    ),
                ),
            ),
        )
    }

    @Test
    fun identityAttributesRoundTrip() {
        val attributes = listOf(
            IdentityAttribute.DocumentType(DocumentType.MNC),
            IdentityAttribute.DocumentNumber("A1234567"),
            IdentityAttribute.IssuingCountry("JPN"),
            IdentityAttribute.FullName("Jane Doe"),
            IdentityAttribute.MinimumAge(18u),
            IdentityAttribute.Nationality("USA"),
        )
        attributes.forEach { attribute ->
            val encoded = IdKitJson.encodeToString(IdentityAttributeSerializer, attribute)
            val decoded = IdKitJson.decodeFromString(IdentityAttributeSerializer, encoded)
            assertEquals(attribute, decoded)
        }
    }

    @Test
    fun constraintNodesEncodeToCoreSchema() {
        assertJsonEquals(
            """{"any":[{"type":"passport"},{"type":"mnc","signal":"sig-2"}]}""",
            IdKitJson.encodeToString(
                ConstraintNode.serializer(),
                anyOf(
                    CredentialRequest(CredentialType.PASSPORT),
                    CredentialRequest(CredentialType.MNC, signal = "sig-2"),
                ),
            ),
        )
        assertJsonEquals(
            """{"all":[{"type":"proof_of_human"}]}""",
            IdKitJson.encodeToString(
                ConstraintNode.serializer(),
                allOf(CredentialRequest(CredentialType.PROOF_OF_HUMAN)),
            ),
        )
        assertJsonEquals(
            """{"enumerate":[{"type":"selfie","genesis_issued_at_min":1700000000}]}""",
            IdKitJson.encodeToString(
                ConstraintNode.serializer(),
                enumerateOf(
                    CredentialRequest(CredentialType.SELFIE, genesisIssuedAtMin = 1_700_000_000u),
                ),
            ),
        )
        // Nested combinators
        assertJsonEquals(
            """{"any":[{"all":[{"type":"passport"}]},{"type":"mnc"}]}""",
            IdKitJson.encodeToString(
                ConstraintNode.serializer(),
                anyOfNodes(
                    listOf(
                        allOf(CredentialRequest(CredentialType.PASSPORT)),
                        ConstraintNode.Item(CredentialRequest(CredentialType.MNC)),
                    ),
                ),
            ),
        )
    }

    @Test
    fun constraintNodesRoundTrip() {
        val node = anyOfNodes(
            listOf(
                allOf(
                    CredentialRequest(CredentialType.PASSPORT, signal = "s"),
                    CredentialRequest(CredentialType.MNC, expiresAtMin = 42u),
                ),
                ConstraintNode.Item(CredentialRequest(CredentialType.PROOF_OF_HUMAN)),
            ),
        )
        val encoded = IdKitJson.encodeToString(ConstraintNode.serializer(), node)
        assertEquals(node, IdKitJson.decodeFromString(ConstraintNode.serializer(), encoded))
    }

    @Test
    fun configDtoCarriesPackageIdentity() {
        val json = IdKitJson.parseToJsonElement(sampleRequestConfig().toConfigJson()).jsonObject

        assertEquals("app_staging_1234567890abcdef", json.getValue("app_id").jsonPrimitive.content)
        assertEquals(SDK_PACKAGE_NAME, json.getValue("package_name").jsonPrimitive.content)
        assertEquals(IDKit.version, json.getValue("package_version").jsonPrimitive.content)
        assertEquals("test-action", json.getValue("action").jsonPrimitive.content)
        assertEquals("staging", json.getValue("environment").jsonPrimitive.content)
        assertEquals("idkitsample://callback", json.getValue("return_to").jsonPrimitive.content)
        assertEquals(
            "rp_1234567890abcdef",
            json.getValue("rp_context").jsonObject.getValue("rp_id").jsonPrimitive.content,
        )
        assertEquals(
            "1700000000",
            json.getValue("rp_context").jsonObject.getValue("created_at").jsonPrimitive.content,
        )
        // Optional nulls are omitted, matching the strict Rust-side DTO.
        assertEquals(false, "bridge_url" in json)
        assertEquals(false, "connect_url_mode" in json)
    }
}
