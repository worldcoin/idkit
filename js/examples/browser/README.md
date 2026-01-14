# IDKit Browser Example

A simple browser example demonstrating World ID verification using IDKit 4.0.

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

Open http://localhost:5173 in your browser (Vite will auto-open it)

#### Production

The example already uses the `@worldcoin/idkit` import. In production, install the package:

```bash
npm install @worldcoin/idkit
```
