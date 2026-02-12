# Swift Tests

## What is covered

- Canonical Swift request status mapping (`pollStatusOnce`)
- Completion polling behavior (`success`, `failure`, `timeout`, `cancelled`)
- Hash overload parity (`String` and `Data`)
- Request item options ergonomics (`signal`, `genesisIssuedAtMin`, `expiresAtMin`)

## Run locally

From repo root:

```bash
bash scripts/package-swift.sh
cd swift
swift build
swift test
xcodebuild test -scheme IDKit -destination "platform=macOS"
```

## Notes

- `scripts/package-swift.sh` must run first to refresh generated bindings and xcframework artifacts.
- The iOS sample app compile check is separate:

```bash
xcodebuild -project swift/Examples/IDKitSampleApp/IDKitSampleApp.xcodeproj -scheme IDKitSampleApp -destination "generic/platform=iOS Simulator" CODE_SIGNING_ALLOWED=NO build
```
