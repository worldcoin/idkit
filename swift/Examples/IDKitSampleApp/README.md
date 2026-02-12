# IDKitSampleApp (iOS)

A minimal iOS app that uses the local `IDKit` Swift package, prints the generated connector URL in the Xcode console, and calls `/api/verify-proof` after proof completion.
The sample also appends `return_to=idkitsample://callback` to the connector URL so World App can deep-link back.

## Run in Xcode

1. Generate Swift artifacts from Rust:
   ```bash
   bash scripts/package-swift.sh
   ```
2. Open the sample project:
   ```bash
   open swift/Examples/IDKitSampleApp/IDKitSampleApp.xcodeproj
   ```
3. In Xcode, choose the `IDKitSampleApp` scheme and an iOS Simulator.
4. Run the app, then tap **Generate Connector URL**.
5. Confirm the URL appears in the UI and in Xcode logs as:
   `IDKit connector URL: ...`
6. After completing the flow in World App, confirm callback logs appear as:
   `IDKit deep link callback: idkitsample://callback...`
7. Confirm verification call logs appear as:
   `IDKit verify result: ...`

## Backend contract

The sample fetches RP signature payload from `http://localhost:3000/api/rp-signature` and posts proof payloads to `http://localhost:3000/api/verify-proof` by default.

Expected JSON shape:

```json
{
  "sig": "0x...",
  "nonce": "0x...",
  "created_at": 1700000000,
  "expires_at": 1700003600
}
```

Use the in-app form to override endpoint/app/action/signal values.
