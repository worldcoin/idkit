package com.worldcoin.idkit

import com.worldcoin.idkit.internal.IdKitJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class StatusMappingTests {

    private fun statusOf(json: String): IDKitStatus =
        mapStatusDto(IdKitJson.decodeFromString(StatusDto.serializer(), json))

    @Test
    fun mapsPendingStates() {
        assertEquals(IDKitStatus.WaitingForConnection, statusOf("""{"state":"waiting_for_connection"}"""))
        assertEquals(IDKitStatus.AwaitingConfirmation, statusOf("""{"state":"awaiting_confirmation"}"""))
    }

    @Test
    fun mapsConfirmedWithResult() {
        val resultObject = IdKitJson.parseToJsonElement(SAMPLE_V3_RESULT_JSON).jsonObject
        val statusJson = IdKitJson.encodeToString(
            JsonObject.serializer(),
            JsonObject(
                mapOf(
                    "state" to IdKitJson.parseToJsonElement("\"confirmed\""),
                    "result" to resultObject,
                ),
            ),
        )

        val status = statusOf(statusJson)
        assertEquals(IDKitStatus.Confirmed(sampleResult()), status)
    }

    @Test
    fun confirmedWithoutResultIsAnError() {
        assertFailsWith<IDKitException> { statusOf("""{"state":"confirmed"}""") }
    }

    @Test
    fun mapsTerminalAndRetryableFailures() {
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.USER_REJECTED),
            statusOf("""{"state":"failed","error_code":"user_rejected"}"""),
        )
        assertEquals(
            IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
            statusOf("""{"state":"networking_error","error_code":"connection_failed"}"""),
        )
    }

    @Test
    fun mapsEveryWireErrorCode() {
        // All 25 wire codes from AppError (error.rs); TIMEOUT and CANCELLED are client-side.
        val wireCodes = IDKitErrorCode.entries - listOf(IDKitErrorCode.TIMEOUT, IDKitErrorCode.CANCELLED)
        assertEquals(25, wireCodes.size)
        wireCodes.forEach { code ->
            assertEquals(
                IDKitStatus.Failed(code),
                statusOf("""{"state":"failed","error_code":"${code.rawValue}"}"""),
            )
        }
    }

    @Test
    fun unknownErrorCodeDegradesToGeneric() {
        assertEquals(
            IDKitStatus.Failed(IDKitErrorCode.GENERIC_ERROR),
            statusOf("""{"state":"failed","error_code":"brand_new_error"}"""),
        )
    }

    @Test
    fun unknownStateIsAnError() {
        assertFailsWith<IDKitException> { statusOf("""{"state":"totally_new_state"}""") }
    }
}
