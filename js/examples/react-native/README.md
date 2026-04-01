# IDKit Hermes React Native Demo

A minimal bare React Native app that exercises the local
`@worldcoin/idkit-react-native` spike on a real native runtime.

The demo mirrors the Swift sample flow:

- fetch RP context from the deployed IDKit JS example
- create a request with `IDKit.request(...).preset(orbLegacy(...))`
- open the connector URI in World App
- poll the request status in-app
- send the completed proof payload to Developer Portal verification

## Before running

From repo root:

```bash
pnpm install
pnpm --filter @worldcoin/idkit-react-native ubrn:ios
pnpm --filter @worldcoin/idkit-react-native ubrn:android
```

The React Native package has native generated artifacts, so those commands need
to run at least once before the example app can link against it.

## Run the app

Install iOS pods once:

```bash
cd js/examples/react-native/ios
bundle install
bundle exec pod install
cd ../../..
```

Start Metro:

```bash
pnpm --filter idkit-react-native-example start
```

In another terminal:

```bash
pnpm --filter idkit-react-native-example ios
```

or:

```bash
pnpm --filter idkit-react-native-example android
```

## Notes

- Hermes is the default engine in this React Native 0.76 app; the demo shows
  the detected engine at the top of the screen.
- The app uses `https://idkit-js-example.vercel.app/api/rp-signature` and
  `https://idkit-js-example.vercel.app/api/verify-proof`, matching the Swift
  sample app.
- The callback scheme is `idkithermesdemo://callback`.
- Android is verified to build with `./gradlew :app:assembleDebug`.
- iOS still hits a CocoaPods local-package resolution issue for
  `IdkitReactNative` during `pod install`, even after the XCFramework is built.
  The blocker is in the generated pod packaging path, not in the example app
  flow itself.
