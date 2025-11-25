# IDKit Kotlin Bindings (UniFFI)

This module mirrors the Swift bindings using UniFFI. It generates a Kotlin API backed by the Rust core and packages the native library plus generated sources.

## Quick start

```bash
# From repo root
./scripts/build-kotlin.sh

# The script:
# 1) Builds the Rust `idkit-uniffi` cdylib
# 2) Generates Kotlin bindings into kotlin/bindings/src/main/kotlin
# 3) Copies the native library into kotlin/bindings/src/main/resources
```

After running the script, open `kotlin/` as a Gradle project. The `bindings` module exposes the generated API. If you run on a different host/ABI, re-run the script so the correct native library is present on your classpath (the JVM must see `libidkit.{so|dylib|dll}` via `java.library.path` or resources).

### Android ABIs

The script cross-builds `libidkit.so` for `arm64-v8a`, `armeabi-v7a`, `x86_64`, and `x86` when Docker is available (via `cross`). Artifacts are copied to `kotlin/bindings/src/main/jniLibs/<abi>/libidkit.so`. Set `SKIP_ANDROID=1` to skip cross-builds locally (useful if Docker isn’t available).

### Convenience helpers

`com.worldcoin.idkit.KotlinCompat.kt` provides small adapters that mirror the Swift helpers:
- Convenience constructors for `Request` from plain strings or ABI-encoded bytes
- `StatusFlow` helper to poll via a `Flow<Status>` with a configurable interval
- Accessors for `Signal.data`/`Signal.string`

These sit beside the generated bindings and don’t modify generated files.
