# IDKit Browser Example

A simple browser example demonstrating World ID verification using IDKit 4.0.

## Usage

#### Local Development

1. From the repo root, install dependencies:
```bash
pnpm install
```

2. Build the core package (so `dist/` exists):
```bash
pnpm --filter @worldcoin/idkit build
```

3. Run the example:
```bash
pnpm --filter idkit-browser-example dev
```

4. Open http://localhost:5173 in your browser (Vite will auto-open it)

#### Production

The example already uses the `@worldcoin/idkit` import. In production, install the package:

```bash
npm install @worldcoin/idkit
```
