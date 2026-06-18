# IDKit Kotlin SDK

Kotlin SDK for World ID verification, backed by the Rust core via UniFFI.

## Installation

The Kotlin SDK is published to Maven Central as `com.worldcoin:idkit` — once a version is released there, add `mavenCentral()` to your repositories and depend on it with no authentication. Release builds are also published to GitHub Packages; dev builds (`X.Y.Z-dev.<sha>`) are published there only.

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

For local integration testing, build the Kotlin artifacts, publish them to `mavenLocal()`, and add `mavenLocal()` to the consuming app repositories:

```bash
bash scripts/build-kotlin.sh
./kotlin/Examples/IDKitSampleApp/gradlew -p kotlin :bindings:publishToMavenLocal
```

Then add `mavenLocal()` to the consuming app repositories:

```kotlin
dependencyResolutionManagement {
    repositories {
        mavenLocal()
        google()
        mavenCentral()
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
import com.worldcoin.idkit.IdentityAttribute
import com.worldcoin.idkit.selfieCheckLegacy
import com.worldcoin.idkit.identityCheck
import com.worldcoin.idkit.orbLegacy
import com.worldcoin.idkit.deviceLegacy
import uniffi.idkit_core.DocumentType
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
    requireUserPresence = false,
    overrideConnectBaseUrl = null,
    returnTo = null,
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

For orb-or-device legacy verification, use:

```kotlin
val request = IDKit
    .request(config)
    .preset(deviceLegacy(signal = "user-123"))
```

For selfie-check verification, use:

```kotlin
val request = IDKit
    .request(config)
    .preset(selfieCheckLegacy(signal = "user-123"))
```

For document-based identity attestation, use:

```kotlin
val request = IDKit
    .request(config)
    .preset(
        identityCheck(
            attributes = listOf(
                IdentityAttribute.MinimumAge(21u),
                IdentityAttribute.Nationality("JPN"),
                IdentityAttribute.DocumentType(DocumentType.PASSPORT),
            ),
        ),
    )
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

## Publishing

On production releases the Kotlin release workflow publishes to GitHub Packages and uploads a signed artifact to Maven Central (the first release awaits manual confirmation in the Central Portal before going live — see below). The GitHub Packages path uses GitHub's package credentials and can also be run locally:

```bash
./kotlin/Examples/IDKitSampleApp/gradlew -p kotlin :bindings:publish
```

Without `-Pidkit.publish.mavenCentral=true`, this does not configure Maven Central upload or signing tasks.

For local integration testing, publish to the local Maven repository with `:bindings:publishToMavenLocal` as described under [Installation](#installation).

To publish to Maven Central from a local machine that already has credentials, keep the secrets in `~/.gradle/gradle.properties`:

```properties
mavenCentralUsername=<central-portal-token-username>
mavenCentralPassword=<central-portal-token-password>
signing.keyId=<gpg-key-id>
signing.password=<gpg-key-password>
signing.secretKeyRingFile=/path/to/secring.gpg
```

Then explicitly enable the Central publishing path for that Gradle invocation:

```bash
./kotlin/Examples/IDKitSampleApp/gradlew -p kotlin \
  -Pidkit.publish.mavenCentral=true \
  :bindings:publishToMavenCentral
```

To upload and release from the Central Portal deployment in one command, run:

```bash
./kotlin/Examples/IDKitSampleApp/gradlew -p kotlin \
  -Pidkit.publish.mavenCentral=true \
  :bindings:publishAndReleaseToMavenCentral
```

On production releases the workflow runs the upload-only `:bindings:publishToMavenCentral` step automatically (not `publishAndReleaseToMavenCentral`), using the Sonatype and GPG signing credentials stored as `production` environment secrets. The first release uploads to the Central Portal for manual confirmation before going live; a follow-up change switches it to fully automatic.

## Troubleshooting

- `connection_failed`:
  - Check bridge URL/network and backend-generated RP context values.
- `timeout`:
  - Increase `IDKitPollOptions(timeoutMs = ...)` or verify user completed flow in World App.
- `cancelled`:
  - The polling coroutine was cancelled by the host app.
