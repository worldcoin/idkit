# IDKit Kotlin Bindings (UniFFI)

This module generates a Kotlin API backed by the Rust core and packages the native library plus generated sources.

## Quick start

```bash
# From repo root
./scripts/build-kotlin.sh      # generate bindings + host lib (+ Android ABIs if Docker available)
# or
./scripts/package-kotlin.sh    # same as above and zips to kotlin/dist/idkit-kotlin-<version>.zip
```

After running, open `kotlin/` as a Gradle project. The `bindings` module exposes the generated API. Re-run the script on any host/ABI you target so the appropriate native libs are staged (`libidkit.{so|dylib|dll}` is placed in `bindings/src/main/resources` for JVM).

### Android ABIs

When Docker is available, the scripts cross-build `libidkit.so` for `arm64-v8a`, `armeabi-v7a`, `x86_64`, and `x86` (using `cross`) and copy them to `kotlin/bindings/src/main/jniLibs/<abi>/libidkit.so`. 
Set `SKIP_ANDROID=1` to skip Android builds (useful on local Macs without Docker); CI runs without that flag to populate the ABI libs for releases.

### Convenience helpers

`com.worldcoin.idkit.KotlinCompat.kt` provides small adapters that mirror the Swift helpers:
- Convenience constructors for `Request` from plain strings or ABI-encoded bytes
- `StatusFlow` helper to poll via a `Flow<Status>` with a configurable interval
- Accessors for `Signal.data`/`Signal.string`

These sit beside the generated bindings and don’t modify generated files.
