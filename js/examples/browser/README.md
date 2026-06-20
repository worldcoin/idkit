# IDKit Browser Example

A simple browser example demonstrating World ID verification using the IDKit core package.

## Usage

#### Local Development

From the repo root:

```bash
pnpm install
pnpm build
```

Then run the example:

```bash
cd js/examples/browser
pnpm dev
```

Open http://localhost:4000 in your browser (Vite will auto-open it)

CDN script-tag pages are also included:

- `legacy-cdn.html` shows `window.IDKit.request(...).preset(...)` with selectable 4.0 and legacy migration presets.
- `session-cdn-4.0.html` shows `window.IDKit.createSession(...)` and `window.IDKit.proveSession(...)` with selectable 4.0 credential constraints.

After `pnpm dev` is running, open:

- `http://localhost:4000/legacy-cdn.html`
- `http://localhost:4000/session-cdn-4.0.html`

Both pages intentionally load the published CDN artifact with one script tag:
`https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core/dist/idkit.global.js`.
This verifies the package was published with `dist/idkit.global.js` and the
sibling `dist/idkit_wasm_bg.wasm` file. The browser example does not serve a
local fallback for these files, so a missing CDN artifact fails visibly.

For pre-publish CDN testing, build the core package, commit the generated
`dist/idkit.global.js` and `dist/idkit_wasm_bg.wasm` files to a branch, and
temporarily point the script tag at:

```html
<script src="https://cdn.jsdelivr.net/gh/worldcoin/idkit@<branch-or-sha>/js/packages/core/dist/idkit.global.js"></script>
```

Both pages use the local `/api/rp-signature` endpoint for backend-only RP
signing.

#### Production

The example uses `@worldcoin/idkit-core` for pure TypeScript/browser usage. In production:

```bash
npm install @worldcoin/idkit-core
```
