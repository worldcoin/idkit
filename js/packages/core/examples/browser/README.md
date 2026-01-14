# IDKit Browser Example

A simple browser example demonstrating World ID verification using IDKit 4.0.

## Usage

#### Local Development

1. Build the core package:
```bash
cd ../../
pnpm build
```

2. Run the example:
```bash
cd examples/browser
pnpm install
pnpm dev
```

3. Open http://localhost:5173 in your browser (Vite will auto-open it)

#### Production

The example already uses the `@worldcoin/idkit` import. In production, install the package:

```bash
npm install @worldcoin/idkit
```
