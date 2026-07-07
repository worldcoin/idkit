package com.worldcoin.idkit

internal fun sampleRpContext(): RpContext = RpContext(
    rpId = "rp_1234567890abcdef",
    nonce = "0x0000000000000000000000000000000000000000000000000000000000000001",
    createdAt = 1_700_000_000u,
    expiresAt = 1_700_003_600u,
    signature = "0x" + "00".repeat(64) + "1b",
)

internal fun sampleRequestConfig(): IDKitRequestConfig = IDKitRequestConfig(
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
)

internal val SAMPLE_V3_RESULT_JSON: String = """
    {
      "protocol_version": "3.0",
      "nonce": "0x01",
      "action": "test-action",
      "responses": [
        {
          "identifier": "proof_of_human",
          "signal_hash": "0x00c5",
          "proof": "0xabcd",
          "merkle_root": "0x1234",
          "nullifier": "0x5678"
        }
      ],
      "user_presence_completed": true,
      "environment": "staging"
    }
""".trimIndent()

internal fun sampleResult(): IDKitResult = idkitResultFromJson(SAMPLE_V3_RESULT_JSON)
