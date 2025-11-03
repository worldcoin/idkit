# IDKit Browser Example

A simple browser example demonstrating World ID verification using IDKit 3.0.

## Features

- **WASM-powered**: Uses Rust core compiled to WebAssembly
- **Type-safe**: Full TypeScript support
- **Multiple credential types**: Orb, Face, Device
- **QR code generation**: Displays scannable QR code for World App
- **Real-time polling**: Waits for user verification

## Usage

### Option 1: Local Development

1. Build the core package:
```bash
cd ../../
pnpm build
```

2. Serve the example:
```bash
cd examples/browser
python3 -m http.server 8000
# or
npx serve
```

3. Open http://localhost:8000 in your browser

### Option 2: Production

Replace the import in `index.html`:

```javascript
// From:
import { initIDKit, Session, Credential } from '../../dist/index.js';

// To:
import { initIDKit, Session, Credential } from '@worldcoin/idkit-core';
```

## Configuration

Update these values in `index.html`:

```javascript
const APP_ID = 'app_staging_123'; // Your app ID from Developer Portal
const ACTION = 'demo-action';      // Your action identifier
```

## API Usage

```javascript
// 1. Initialize WASM
await initIDKit();

// 2. Create session
const session = await Session.create({
    app_id: 'app_xxx',
    action: 'my-action',
    requests: [{
        type: Credential.Orb,
        signal: 'my-signal',
    }],
});

// 3. Get QR code URL
const url = session.connectUrl();

// 4. Wait for proof
const proof = await session.waitForProof();
console.log(proof);
```

## Requirements

- Modern browser with WebAssembly support
- ES modules support (all modern browsers)
- Web Crypto API (HTTPS or localhost)
