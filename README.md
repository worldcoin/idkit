# IDKit - World ID SDK

IDKit is the toolkit for anonymous proof of human. Integrate the [World ID Protocol](https://world.org/world-id) into your application.

## SDKs

- JavaScript / TypeScript: [`@worldcoin/idkit-core`](./js/packages/core)
- Swift: [`./swift`](./swift)
- Kotlin: [`./kotlin`](./kotlin)

## Swift quick local run

```bash
bash scripts/package-swift.sh
cd swift
swift build
swift test
xcodebuild test -scheme IDKit -destination "platform=macOS"
```

Example iOS app:

- Project: `./swift/Examples/IDKitSampleApp/IDKitSampleApp.xcodeproj`

## License

MIT License - see [LICENSE](./LICENSE) for details.
