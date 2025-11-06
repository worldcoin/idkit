# Testing Swift Bindings

## Note on Local Testing

The Swift package tests require proper linking to the compiled Rust library (`libidkit.dylib`).

Swift Package Manager alone cannot handle linking external C libraries from the file system without additional configuration. The tests will work properly in:

1. **CI Environment** - Where we use system-wide uniffi-bindgen installation
2. **Xcode Projects** - Where you can configure library search paths
3. **Production Apps** - Where the library is bundled with the framework

## Running Tests Locally

### Verify Code Compiles (Without Running)

The fact that the code compiles with the generated bindings is a good smoke test:

```bash
# Generate bindings
./scripts/build-swift.sh

# Check if Swift files are valid
cd swift
swift build --dry-run
```

### Xcode

1. Generate bindings: `./scripts/build-swift.sh`
2. Open `swift/` in Xcode
3. Configure library search paths to include `../target/release/`
4. Run tests in Xcode

### CI Testing

The CI workflow:
1. Builds Rust library
2. Generates Swift bindings
3. Builds Swift package with proper linking
4. Runs all tests