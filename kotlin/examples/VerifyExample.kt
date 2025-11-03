package com.worldcoin.idkit.examples

import kotlinx.coroutines.*
import uniffi.idkit.*

/**
 * Example demonstrating World ID verification with IDKit Kotlin bindings
 */
fun main() = runBlocking {
    // Initialize IDKit
    init()

    println("IDKit Kotlin Example - World ID Verification")
    println("=".repeat(50))

    // Example 1: API with verification level
    println("\n1. Creating session with verification level")
    val session1 = IdkitSession.fromVerificationLevel(
        appId = "app_staging_1234567890abcdef",
        action = "verify-human",
        verificationLevel = VerificationLevel.ORB,
        signal = "user_12345"
    )

    val connectUrl = session1.connectUrl()
    println("   Connect URL: $connectUrl")
    println("   Scan this QR code with World App to verify")

    // Example 2: API with credential requests
    println("\n2. Creating session with credential requests")
    val requests = listOf(
        RequestConfig(
            credentialType = Credential.ORB,
            signal = "user_12345",
            faceAuth = null
        )
    )

    val session2 = IdkitSession.withRequests(
        appId = "app_staging_1234567890abcdef",
        action = "verify-human",
        requests = requests
    )

    println("   Connect URL: ${session2.connectUrl()}")

    // Example 3: Poll for status
    println("\n3. Polling for verification status...")
    var attempts = 0
    val maxAttempts = 5

    while (attempts < maxAttempts) {
        when (val status = session2.poll()) {
            is SessionStatus.WaitingForConnection -> {
                println("   Status: Waiting for user to scan QR code...")
            }
            is SessionStatus.AwaitingConfirmation -> {
                println("   Status: Waiting for user confirmation...")
            }
            is SessionStatus.Confirmed -> {
                println("   Status: Verified!")
                println("   Proof: ${status.proof.proof.take(20)}...")
                println("   Merkle Root: ${status.proof.merkleRoot}")
                println("   Nullifier Hash: ${status.proof.nullifierHash}")
                println("   Verification Level: ${status.proof.verificationLevel}")
                return@runBlocking
            }
            is SessionStatus.Failed -> {
                println("   Status: Failed - ${status.error}")
                return@runBlocking
            }
        }

        attempts++
        delay(2000) // 2 seconds
    }

    println("\n   Polling timed out, but you can continue polling or use waitForProof()")

    // Example 4: Wait for proof with timeout (blocking)
    println("\n4. Waiting for proof (alternative approach)...")
    println("   Note: In a real app, you'd use one approach or the other, not both")

    try {
        val proof = session2.waitForProof(timeoutMs = 120_000u) // 2 minute timeout
        println("   Proof received!")
        println("   Merkle Root: ${proof.merkleRoot}")
        println("   Nullifier Hash: ${proof.nullifierHash}")
    } catch (e: IdkitException) {
        when (e) {
            is IdkitException.Timeout -> {
                println("   Verification timed out")
            }
            is IdkitException.NetworkError -> {
                println("   Network error: ${e.message}")
            }
            is IdkitException.AppError -> {
                println("   App error: ${e.message}")
            }
            else -> {
                println("   Error: ${e.message}")
            }
        }
    }

    println("\n" + "=".repeat(50))
    println("Example complete!")
}

/**
 * Example with Android integration
 */
class VerifyActivity {
    fun verifyUser() {
        // In a real Android app, you'd use coroutines for async operations
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Create session
                val session = IdkitSession.withRequests(
                    appId = "app_staging_1234567890abcdef",
                    action = "verify-human",
                    requests = listOf(
                        RequestConfig(
                            credentialType = Credential.ORB,
                            signal = "user_12345",
                            faceAuth = null
                        )
                    )
                )

                // Get connect URL and display QR code
                val connectUrl = session.connectUrl()
                withContext(Dispatchers.Main) {
                    showQRCode(connectUrl)
                }

                // Poll for status
                while (true) {
                    when (val status = session.poll()) {
                        is SessionStatus.WaitingForConnection -> {
                            // Update UI
                        }
                        is SessionStatus.AwaitingConfirmation -> {
                            // Update UI
                        }
                        is SessionStatus.Confirmed -> {
                            withContext(Dispatchers.Main) {
                                handleProof(status.proof)
                            }
                            break
                        }
                        is SessionStatus.Failed -> {
                            withContext(Dispatchers.Main) {
                                showError(status.error)
                            }
                            break
                        }
                    }
                    delay(2000)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showError(e.message ?: "Unknown error")
                }
            }
        }
    }

    private fun showQRCode(url: String) {
        // Generate and display QR code
        println("Show QR code: $url")
    }

    private fun handleProof(proof: Proof) {
        // Send proof to backend for verification
        println("Proof received: ${proof.nullifierHash}")
    }

    private fun showError(message: String) {
        println("Error: $message")
    }
}
