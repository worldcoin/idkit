# IDKit Browser Example

A simple browser example demonstrating World ID verification using IDKit 3.0.

## Usage

#### Local Development

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

#### Production

Replace the import in `index.html`:

```javascript
// From:
import { initIDKit, Session, Credential } from '../../dist/index.js';

// To:
import { initIDKit, Session, Credential } from '@worldcoin/idkit';
```

## Configuration

Update these values in `index.html`:

```javascript
const APP_ID = 'app_staging_123'; // Your app ID from the Developer Portal
const ACTION = 'demo-action';     // Your action identifier from the Developer Portal
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
