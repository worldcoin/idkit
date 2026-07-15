# IDKit KMP Sample App

Kotlin Multiplatform sample for the [IDKit KMP SDK](../../README.md): the verification flow (RP-signature fetch → request creation → polling → server-side proof verification) lives once in the [`shared`](shared) module, and each platform ships a fully native UI — Jetpack Compose on Android, SwiftUI on iOS.

```
shared/      SampleController: Ktor + IDKit KMP flow, StateFlow-based state
androidApp/  Compose UI, deep-link handling (idkitkmpsample://callback)
iosApp/      SwiftUI UI (XcodeGen project), same deep link via CFBundleURLTypes
```

The sample builds the SDK from source (`:idkit` is included via `project(":idkit").projectDir = file("../../idkit")`).

## Prerequisites

From the repo root, build the native Rust artifacts first:

```bash
bash scripts/build-kotlin.sh                 # everything (Android ABIs need Docker or cargo-ndk)
SKIP_ANDROID=1 bash scripts/build-kotlin.sh  # iOS + host only
```

You also need JDK 17+, the Android SDK, and (for iOS) Xcode + [XcodeGen](https://github.com/yonaskolb/XcodeGen) — the Xcode project is generated from `project.yml` and not checked in.

## Android (Compose)

```bash
cd kotlin/Examples/IDKitKmpSampleApp
./gradlew :androidApp:assembleDebug
./gradlew :androidApp:installDebug        # with an emulator/device connected
```

Note: the APK only contains `libidkit_kmp.so` for the ABIs that `scripts/build-kotlin.sh` actually built — running on a device/emulator requires the Android cross-build step (Docker or cargo-ndk), not just `SKIP_ANDROID=1`.

Deep-link smoke test:

```bash
adb shell am start -a android.intent.action.VIEW -d "idkitkmpsample://callback"
```

## iOS (SwiftUI)

```bash
cd kotlin/Examples/IDKitKmpSampleApp/iosApp
xcodegen generate                         # the .xcodeproj is gitignored — always generate it from project.yml
open IDKitKmpSampleApp.xcodeproj
```

Build and run the `IDKitKmpSampleApp` scheme. A scheme pre-action verifies the Rust static libraries exist (and tells you to run `scripts/build-kotlin.sh` if not); a build phase (`build-shared-framework.sh`) invokes Gradle's `embedAndSignAppleFrameworkForXcode` to build the shared Kotlin framework for the current configuration/SDK.

CLI build:

```bash
xcodebuild -project IDKitKmpSampleApp.xcodeproj -scheme IDKitKmpSampleApp \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Using the sample

1. Pick an environment (production/staging) and a preset, then tap **Generate Connector URL**. This fetches an RP signature from the hosted demo backend (`idkit-js-example.vercel.app`) and creates the bridge request.
2. Open the connector URL (opens World App on a device that has it installed).
3. After confirming in World App, the app returns via the `idkitkmpsample://callback` deep link; the sample polls the bridge, and on confirmation POSTs the proof (`result.rawJson`, verbatim) to the demo verify endpoint and logs the response.
