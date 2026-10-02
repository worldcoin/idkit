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

The JavaScript SDKs use TypeScript protocol and cryptography implementations.
They ship no WASM binaries and require no Rust toolchain to build or use. Native
Rust remains the compatibility reference: checked-in fixtures run in ordinary JS
tests, and a separate differential test gate checks the current Rust core.

Use Node.js 22 and the pinned pnpm 9.15.4 for development:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm type-check
corepack pnpm audit:dependencies
corepack pnpm test:packages
```

With the repository's Rust toolchain installed, run `pnpm test:conformance` to
compare the implementations. Published packages support Node.js 18 and newer;
CI executes packed CommonJS and ES module consumers on Node.js 18, 22 and 24.
React Native apps use `@worldcoin/idkit/hooks` and provide host secure randomness
when unavailable globally.

The root workspace's development dependency graph is also WASM-free. Browser/Worker
test tools and the Next example use explicit, separate installs in this same
repository; their external tool graphs may include optional WASM packages. See
[the runtime test setup](./tools/runtime/README.md) and
[the packed-SDK Next example](./js/examples/nextjs/README.md).

See the [JavaScript development guide](./js/README.md),
[React Native integration](./js/packages/react/README.md#react-native-and-headless-react)
and [release checklist](./docs/pure-js-sdk-release.md).

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
