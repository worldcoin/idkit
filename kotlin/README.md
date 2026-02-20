# IDKit Kotlin SDK

Kotlin SDK for World ID verification, backed by the Rust core via UniFFI.

## Installation

The Kotlin package is published to GitHub Packages as `com.worldcoin:idkit`.

GitHub Packages requires authentication for Maven downloads, even for public packages.
Create a token with `read:packages` and expose it through environment variables.

```kotlin
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven {
            url = uri("https://maven.pkg.github.com/worldcoin/idkit")
            credentials {
                username = System.getenv("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN")
            }
        }
    }
}
```

Then add the dependency:

```kotlin
implementation("com.worldcoin:idkit:<version>")
```

## Local setup

From repo root:

```bash
bash scripts/build-kotlin.sh
```

This builds Rust artifacts, regenerates UniFFI Kotlin bindings, and copies native libraries used by the Kotlin module.

## Canonical Kotlin API

- Entry points:
  - `IDKit.request(config: IDKitRequestConfig)`
  - `IDKit.createSession(config: IDKitSessionConfig)`
  - `IDKit.proveSession(sessionId: String, config: IDKitSessionConfig)`
- Request object:
  - `connectorURI: String`
  - `requestId: String`
  - `pollStatusOnce(): IDKitStatus`
  - `pollUntilCompletion(options: IDKitPollOptions): IDKitCompletionResult`
- Hashing:
  - `IDKit.hashSignal(signal: String)`
  - `IDKit.hashSignal(signal: ByteArray)`

## Quickstart

```kotlin
import com.worldcoin.idkit.CredentialRequest
import com.worldcoin.idkit.IDKit
import com.worldcoin.idkit.IDKitPollOptions
import com.worldcoin.idkit.IDKitRequestConfig
import com.worldcoin.idkit.IDKitCompletionResult
import com.worldcoin.idkit.orbLegacy
import uniffi.idkit_core.Environment
import uniffi.idkit_core.RpContext

val rpContext = RpContext(
    rpId = "rp_1234567890abcdef",
    nonce = backendNonce,
    createdAt = backendCreatedAt,
    expiresAt = backendExpiresAt,
    signature = backendSig,
)

val config = IDKitRequestConfig(
    appId = "app_staging_1234567890abcdef",
    action = "login",
    rpContext = rpContext,
    actionDescription = "Log in",
    bridgeUrl = null,
    allowLegacyProofs = false,
    overrideConnectBaseUrl = null,
    environment = Environment.STAGING,
)

val request = IDKit
    .request(config)
    .preset(orbLegacy(signal = "user-123"))

println("Connector URL: ${request.connectorURI}")

when (val completion = request.pollUntilCompletion(IDKitPollOptions())) {
    is IDKitCompletionResult.Success -> println("Verified: ${completion.result.protocolVersion}")
    is IDKitCompletionResult.Failure -> println("Failed: ${completion.error.rawValue}")
}
```

## Credential request options parity

```kotlin
import com.worldcoin.idkit.CredentialRequest
import com.worldcoin.idkit.CredentialRequestOptions
import uniffi.idkit_core.CredentialType

val orb = CredentialRequest(
    CredentialType.ORB,
    options = CredentialRequestOptions(
        signal = "user-123",
        genesisIssuedAtMin = 1_700_000_000u,
        expiresAtMin = 1_800_000_000u,
    ),
)
```

## Session flow example

```kotlin
val sessionRequest = IDKit
    .createSession(sessionConfig)
    .constraints(anyOf(CredentialRequest(CredentialType.ORB)))

val completion = sessionRequest.pollUntilCompletion()
```

## Android sample app

A runnable Android sample exists at:

- `kotlin/Examples/IDKitSampleApp`

See `kotlin/Examples/IDKitSampleApp/README.md` for run steps.

## Migration notes (`IdKit` -> `IDKit`)

This release removes the legacy `IdKit` entrypoint and uses canonical `IDKit` naming.

- `IdKit.request(...)` -> `IDKit.request(...)`
- old raw `IdKitBuilder` wrapper usage -> canonical `IDKitBuilder`
- old raw status/result wrappers -> `IDKitStatus` and `IDKitCompletionResult`

## Local verification loop

```bash
bash scripts/build-kotlin.sh
```

If Gradle is available locally:

```bash
gradle -p kotlin bindings:test
```

## Troubleshooting

- `connection_failed`:
  - Check bridge URL/network and backend-generated RP context values.
- `timeout`:
  - Increase `IDKitPollOptions(timeoutMs = ...)` or verify user completed flow in World App.
- `cancelled`:
  - The polling coroutine was cancelled by the host app.
