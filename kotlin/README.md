# IDKit Kotlin

Kotlin bindings for the World ID SDK, built with Rust and UniFFI.
## Installation

### Gradle (Android/JVM)

Add to your `build.gradle.kts`:

```kotlin
dependencies {
    implementation("com.worldcoin:idkit:3.0.0")
}
```

Or `build.gradle`:

```groovy
dependencies {
    implementation 'com.worldcoin:idkit:3.0.0'
}
```

### Manual Installation

1. Copy the generated Kotlin file to your project:
   - `src/main/kotlin/uniffi/idkit/idkit.kt`

2. Add the native library (JNI):
   - Copy `libidkit.so` (Linux), `libidkit.dylib` (macOS), or `idkit.dll` (Windows)
   - Place in `src/main/jniLibs` for Android or system library path for JVM

## Usage

### Initialize IDKit

```kotlin
import uniffi.idkit.*

// Initialize once at app startup
init()
```

### Create a Verification Session

**Option 1: API with Verification Level**

```kotlin
val session = IdkitSession.fromVerificationLevel(
    appId = "app_staging_1234567890abcdef",
    action = "verify-human",
    verificationLevel = VerificationLevel.ORB,
    signal = "user_12345"
)
```

**Option 2: API with Credential Requests** 

```kotlin
val requests = listOf(
    RequestConfig(
        credentialType = Credential.ORB,
        signal = "user_12345",
        faceAuth = null
    )
)

val session = IdkitSession.withRequests(
    appId = "app_staging_1234567890abcdef",
    action = "verify-human",
    requests = requests
)
```

### Get Connect URL

```kotlin
val connectUrl = session.connectUrl()
println(connectUrl)
// https://world.org/verify?t=wld&i=...&k=...

// Generate QR code from connectUrl and display to user
```

### Wait for Proof

**Option 1: Poll for Status**

```kotlin
import kotlinx.coroutines.*

CoroutineScope(Dispatchers.IO).launch {
    while (true) {
        when (val status = session.poll()) {
            is SessionStatus.WaitingForConnection -> {
                println("Waiting for user to scan QR code...")
            }
            is SessionStatus.AwaitingConfirmation -> {
                println("Waiting for user confirmation...")
            }
            is SessionStatus.Confirmed -> {
                println("Verified!")
                handleProof(status.proof)
                break
            }
            is SessionStatus.Failed -> {
                println("Failed: ${status.error}")
                break
            }
        }
        delay(2000) // 2 seconds
    }
}
```

**Option 2: Wait for Proof**

```kotlin
try {
    val proof = session.waitForProof(timeoutMs = 120_000u) // 2 minute timeout
    handleProof(proof)
} catch (e: IdkitException.Timeout) {
    println("Verification timed out")
} catch (e: IdkitException) {
    println("Error: ${e.message}")
}
```

### Handle Proof

```kotlin
fun handleProof(proof: Proof) {
    println("Proof: ${proof.proof}")
    println("Merkle Root: ${proof.merkleRoot}")
    println("Nullifier Hash: ${proof.nullifierHash}")
    println("Verification Level: ${proof.verificationLevel}")

    // Send to your backend for verification
    verifyProofOnBackend(proof)
}
```

## API Reference

### Types

#### `IdkitSession`

Main session interface for World ID verification.

**Constructors:**
- `fromVerificationLevel(appId, action, verificationLevel, signal)` - Verification level API
- `withRequests(appId, action, requests)` - API with specific credential requests

**Methods:**
- `connectUrl(): String` - Get the World App connect URL
- `poll(): SessionStatus` - Poll for current status (non-blocking)
- `waitForProof(timeoutMs: ULong?): Proof` - Wait for proof (blocking, optional timeout)

#### `Credential`

Verification credential types:
- `Credential.ORB` - Orb verification
- `Credential.FACE` - Face check
- `Credential.SECURE_DOCUMENT` - Secure document verification
- `Credential.DOCUMENT` - Document verification
- `Credential.DEVICE` - Device verification

#### `VerificationLevel`

Verification levels for backward compatibility:
- `VerificationLevel.ORB`
- `VerificationLevel.FACE`
- `VerificationLevel.DEVICE`
- `VerificationLevel.DOCUMENT`
- `VerificationLevel.SECURE_DOCUMENT`

#### `SessionStatus`

Verification session status (sealed class):
- `SessionStatus.WaitingForConnection` - Waiting for user to scan QR code
- `SessionStatus.AwaitingConfirmation` - Waiting for user to confirm
- `SessionStatus.Confirmed(proof: Proof)` - Verification complete
- `SessionStatus.Failed(error: String)` - Verification failed

#### `Proof`

World ID proof data:
- `proof: String` - The zero-knowledge proof
- `merkleRoot: String` - Merkle tree root
- `nullifierHash: String` - Unique nullifier for this action
- `verificationLevel: Credential` - Credential type that was verified

#### `IdkitException`

Exception types (sealed class):
- `IdkitException.InvalidConfiguration(message: String)` - Invalid configuration
- `IdkitException.NetworkError(message: String)` - Network communication error
- `IdkitException.CryptoError(message: String)` - Cryptography error
- `IdkitException.AppError(message: String)` - World App error
- `IdkitException.Timeout` - Request timed out
- `IdkitException.InvalidProof(message: String)` - Invalid proof

## Android Integration Example

```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var session: IdkitSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize IDKit
        init()

        verifyButton.setOnClickListener {
            verifyUser()
        }
    }

    private fun verifyUser() {
        lifecycleScope.launch {
            try {
                // Create session
                session = IdkitSession.withRequests(
                    appId = "app_staging_1234567890abcdef",
                    action = "verify-human",
                    requests = listOf(
                        RequestConfig(
                            credentialType = Credential.ORB,
                            signal = "user_${userId}",
                            faceAuth = null
                        )
                    )
                )

                // Show QR code
                val connectUrl = session.connectUrl()
                showQRCode(connectUrl)

                // Poll for verification
                withContext(Dispatchers.IO) {
                    pollForVerification()
                }
            } catch (e: Exception) {
                showError(e.message ?: "Unknown error")
            }
        }
    }

    private suspend fun pollForVerification() {
        while (true) {
            when (val status = session.poll()) {
                is SessionStatus.WaitingForConnection -> {
                    updateStatus("Waiting for scan...")
                }
                is SessionStatus.AwaitingConfirmation -> {
                    updateStatus("Awaiting confirmation...")
                }
                is SessionStatus.Confirmed -> {
                    withContext(Dispatchers.Main) {
                        handleSuccess(status.proof)
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
    }

    private fun showQRCode(url: String) {
        // Use a QR code library like ZXing
        val bitmap = QRCodeGenerator.generate(url)
        qrCodeImageView.setImageBitmap(bitmap)
    }

    private fun handleSuccess(proof: Proof) {
        // Send proof to your backend
        apiService.verifyProof(proof)
    }
}
```

## Examples

See `examples/VerifyExample.kt` for complete working examples.

To run the example:

```bash
cd kotlin
kotlinc examples/VerifyExample.kt -include-runtime -d example.jar
java -jar example.jar
```

## Building from Source

### Prerequisites

- Rust 1.70+
- Kotlin 1.8+
- Java 11+

### Build Steps

1. Install UniFFI bindgen:
   ```bash
   pip3 install uniffi-bindgen==0.30.0
   ```

2. Build Rust library:
   ```bash
   cd rust/uniffi-bindings
   cargo build --release
   ```

3. Generate Kotlin bindings:
   ```bash
   uniffi-bindgen generate src/idkit.udl --language kotlin --out-dir ../../kotlin/src/main/kotlin
   ```

4. The generated files are:
   - `kotlin/src/main/kotlin/uniffi/idkit/idkit.kt` - Kotlin interface
   - `target/release/libidkit.so` - Native library (Linux)
   - `target/release/libidkit.dylib` - Native library (macOS)

## Platform Support

- ✅ Android 7.0+ (API 24+)
- ✅ JVM 11+
- ✅ Kotlin/Native (experimental)

## ProGuard Rules

If using ProGuard/R8 for Android, add these rules:

```proguard
-keep class uniffi.idkit.** { *; }
-keepclassmembers class uniffi.idkit.** { *; }
```