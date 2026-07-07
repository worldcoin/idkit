# IDKit Kotlin SDK

World ID SDK for Kotlin Multiplatform — one Kotlin API for **Android and iOS**, backed by the same Rust core as every other IDKit SDK. Plain Android apps consume it as a regular AAR; KMP projects use it from `commonMain`.

```kotlin
val config = IDKitRequestConfig(
    appId = "app_...",
    action = "my-action",
    rpContext = RpContext(rpId = "rp_...", nonce = nonce, createdAt = createdAt, expiresAt = expiresAt, signature = sig),
    returnTo = "myapp://callback",
)

val request = IDKit.request(config).preset(orbLegacy(signal = "my-signal"))
openWorldApp(request.connectorURI)

when (val completion = request.pollUntilCompletion()) {
    is IDKitCompletionResult.Success -> verifyOnBackend(completion.result.rawJson)
    is IDKitCompletionResult.Failure -> handle(completion.error)
}
request.close()
```

## Installation

The SDK is published to Maven Central as `com.worldcoin:idkit` — add `mavenCentral()` to your repositories and depend on it with no authentication. Release builds are also published to GitHub Packages; dev builds (`X.Y.Z-dev.<sha>`) are published there only (GitHub Packages requires a token with `read:packages` even for public packages).

Plain Android app or a KMP project's `commonMain` — same coordinates either way:

```kotlin
dependencies {
    implementation("com.worldcoin:idkit:<version>")
}
```

Pure-iOS (Swift-only) apps should prefer the [Swift SDK](../swift), which has first-class Swift types.

### Migrating from 4.x

5.0.0 replaces the UniFFI/JNA Android-only implementation with the Kotlin Multiplatform one. Coordinates (`com.worldcoin:idkit`) and package (`com.worldcoin.idkit`) are unchanged, but there are breaking API changes:

- `IDKitBuilder.preset(...)` / `.constraints(...)` are now `suspend` (they open the bridge connection; 4.x did this blocking).
- Call `IDKitRequest.close()` when done with a request to release the native handle (safe to call twice).
- Types that previously leaked from `uniffi.idkit_core.*` (`RpContext`, `Environment`, `DocumentType`, `IdentityAttribute`, `ConstraintNode`, …) now live in `com.worldcoin.idkit` — update imports.

## Architecture

The SDK calls the Rust core **directly** through a small hand-written C ABI — it does not use UniFFI-generated bindings:

```
         commonMain (kotlin/idkit)
  public API + poll loop + status/error mapping
  kotlinx-serialization DTOs for the JSON boundary
                    │
     internal expect object NativeBridge (10 fns)
       ┌────────────┴────────────┐
  androidMain                iosMain
  JNA direct mapping         Kotlin/Native cinterop
  libidkit_kmp.so            libidkit_kmp.a (static)
       └────────────┬────────────┘
        rust/kmp-ffi (extern "C", JSON in/out)
                    │
              rust/core (idkit-core)
```

Why this shape:

- **Why not generate KMP bindings from UniFFI?** The Rust core uses UniFFI 0.31; no Kotlin Multiplatform binding generator supports it (Gobley, the maintained one, targets UniFFI 0.29.x, and the compiled-metadata formats are incompatible). Downgrading the workspace's UniFFI would regenerate the shipping Swift SDK bindings and couple future core upgrades to a third-party release cadence.
- **The C ABI** (`rust/kmp-ffi`, header at `rust/kmp-ffi/include/idkit_kmp.h`) passes JSON both ways and reuses the serde codecs the core already has. Every function returns an `{"ok": ...}` / `{"err": {code, message}}` envelope; panics are caught and converted to envelopes (never unwind across FFI); requests are opaque handles so double-free is a no-op; network-bound calls have a bounded 30s deadline and run off the main thread. It is independent of UniFFI versioning by construction.
- **Distinct native library name** (`libidkit_kmp` vs the UniFFI toolchain's `libidkit`) keeps host test artifacts and the Swift SDK's build products from colliding.

## Building

Native artifacts are never committed; build them first from the repo root:

```bash
bash scripts/build-kotlin.sh                 # host lib + Android ABIs (Docker/cargo-ndk) + iOS static libs
SKIP_ANDROID=1 bash scripts/build-kotlin.sh  # macOS host + iOS only (no Docker/NDK needed)
```

Outputs:

- `target/release/libidkit_kmp.{dylib,so}` — host library for JVM unit tests
- `kotlin/idkit/src/androidMain/jniLibs/<abi>/libidkit_kmp.so` — Android (gitignored)
- `target/<triple>/release/libidkit_kmp.a` — iOS, referenced by the cinterop config

Android cross-builds use the `kmp-android-release` cargo profile (`panic = "unwind"`) — **not** `android-release` — because the FFI layer's `catch_unwind` must be able to convert panics into error envelopes instead of aborting the host app.

Then:

```bash
cd kotlin
./gradlew :idkit:assemble                  # all targets enabled on this host
./gradlew :idkit:testReleaseUnitTest       # commonTest on the host JVM (JNA → host lib)
./gradlew :idkit:iosSimulatorArm64Test     # commonTest on the iOS simulator (cinterop, statically linked)
./gradlew :idkit:publishToMavenLocal       # a guard task verifies the native artifacts for enabled targets
```

Requires JDK 17+, the Android SDK (`local.properties` or `ANDROID_HOME`), and Xcode on macOS for the iOS targets. On Linux the iOS targets are disabled automatically; **publishing to a remote repository is macOS-only** (the build fails it elsewhere, because the upload would otherwise be missing the iOS variants).

## API notes

- `IDKitBuilder.preset(...)` / `.constraints(...)` are `suspend` and open the bridge connection over the network.
- Call `IDKitRequest.close()` when done with a request to release the native handle (safe to call twice; the samples do it after the terminal status).
- `IDKitResult.rawJson` is the untouched result JSON from the core — POST it verbatim to backend verification endpoints so unmodeled fields survive.
- `IDKit.hashSignal(String)` follows the JS `hashSignal` semantics; use the `ByteArray` overload for binary signals (including any with interior NUL bytes).
- Session and invite-code APIs are not exposed yet ("TODO: Re-enable when World ID 4.0 is live").
- Kotlin and AGP versions are pinned in `kotlin/build.gradle.kts`; upgrade them in lockstep (Kotlin/Native ↔ Xcode compatibility matters here).

## Example apps

- [`Examples/IDKitSampleApp`](Examples/IDKitSampleApp) — plain Android app (Jetpack Compose) consuming the SDK the way an Android-only integrator would.
- [`Examples/IDKitKmpSampleApp`](Examples/IDKitKmpSampleApp) — KMP app: shared verification flow (Ktor + this SDK) driven by two native UIs, Jetpack Compose on Android and SwiftUI on iOS. See its README for run instructions (the iOS Xcode project is generated with XcodeGen, not checked in).
