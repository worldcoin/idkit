package com.worldcoin.idkit

import java.io.File
import java.math.BigInteger
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

class NullifierTests {
    @Test
    fun `nullifier uses shared numeric parsing examples`() {
        val vectors = Json.parseToJsonElement(File("../../test-vectors/nullifier.json").readText()).jsonObject
        for (item in vectors.getValue("valid").jsonArray) {
            val vector = item.jsonObject
            val value = Nullifier.fromHex(vector.getValue("input").jsonPrimitive.content)
            val decimal = vector.getValue("decimal").jsonPrimitive.content
            assertEquals(vector.getValue("hex").jsonPrimitive.content, value.toHex())
            assertEquals(BigInteger(decimal), value.toBigInteger())
            assertEquals(vector.getValue("canonical").jsonPrimitive.content, value.toCanonicalString())
            val restored = Nullifier.fromCanonicalString(value.toCanonicalString())
            assertEquals(value.toHex(), restored.toHex())
            assertEquals(value.toBigInteger(), restored.toBigInteger())
            assertEquals(decimal, Nullifier.fromHex(value.toHex()).toDecimalString())
        }
        for (input in vectors.getValue("invalid_canonical").jsonArray) {
            assertFails { Nullifier.fromCanonicalString(input.jsonPrimitive.content) }
        }
        for (input in vectors.getValue("invalid").jsonArray) {
            assertFails { Nullifier.fromHex(input.jsonPrimitive.content) }
        }
    }
}
