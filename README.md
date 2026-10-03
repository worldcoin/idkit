# IDKit - World ID SDK

IDKit is the toolkit for anonymous proof of human. Integrate the [World ID Protocol](https://world.org/world-id) into your application.

## SDKs

- JavaScript / TypeScript: [`@worldcoin/idkit-core`](./js/packages/core)
- React widgets and headless hooks: [`@worldcoin/idkit`](./js/packages/react)
- JavaScript RP signing: [`@worldcoin/idkit-server`](./js/packages/server)
- Go (server): [`go/idkit`](./go/idkit)
- Swift: [`./swift`](./swift)
- Kotlin: [`./kotlin`](./kotlin)

## JavaScript development

The JavaScript SDKs build and run without WASM or a Rust toolchain. Use Node.js 22
and pnpm 9.15.4:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm type-check
```

With the repository's Rust toolchain installed, `pnpm test:conformance` compares
JavaScript crypto, protocol, public types and HTTP behavior directly against the
current native Rust core. Add cases when changing the protocol; expected results
come from Rust at test time. No generated fixtures need to be committed.

`pnpm audit:dependencies` checks that SDK dependencies and installed assets are
WASM-free. `pnpm test:packages` checks packed Node.js consumers. Browser/Worker
tools and the [Next example](./js/examples/nextjs) install separately so their
framework dependencies stay outside the SDK graph.

The tsup patch makes source-map cleanup optional when using the JavaScript
`source-map-js` implementation. Keep it aligned with the version-scoped override;
`pnpm test:tooling` verifies source-map composition without WebAssembly.

For React Native, use the [headless hooks](./js/packages/react/README.md#react-native-and-headless-react)
and provide host secure randomness when unavailable globally.

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
