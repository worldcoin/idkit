# JavaScript build dependency patch

`tsup@8.5.1` normally depends on `source-map@0.7`, which includes
`lib/mappings.wasm`. The root manifest narrowly overrides **only tsup 8.5.1's**
`source-map` dependency with `source-map-js@1.2.1`, a JavaScript implementation.
The patch makes the two source-map consumers' `destroy()` calls optional because
JavaScript consumers have no WASM allocation to release.

`pnpm test:tooling` builds a fixture through tsup's `renderChunk` composition path
with `WebAssembly` removed and checks the final mapped source line and column.
`pnpm audit:dependencies` also checks the complete root lockfile (including
optional platform dependencies) and installed files. When updating tsup, review
its source-map API usage and remove/update this explicit version-scoped override
and patch together. Do not loosen the audit to accommodate an upgraded bundler.
