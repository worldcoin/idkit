# Browser and Worker test tools

This is an isolated pnpm workspace. Its dependencies are installed only when
running real browser/Worker acceptance tests; they are absent from the SDK
workspace lockfile, normal install, build and unit tests.

Miniflare's dependency graph includes Sharp's optional WASM variants. Those are
runtime **test infrastructure**, not SDK dependencies. Keeping this separate
install explicit makes the boundary auditable; it does not claim these external
tools are WASM-free. Playwright and workerd still execute the candidate SDK with
no WebAssembly API or Node compatibility flags, respectively.

From the repository root, using the pinned pnpm version:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm -C tools/runtime install --frozen-lockfile
corepack pnpm -C tools/runtime exec playwright install chromium
corepack pnpm test:portable
```

`test:portable` packs and installs the SDKs in a fresh consumer before testing.
Release CI instead supplies `--artifacts release-artifacts` to test the exact
prepared and checksum-verified tarballs without rebuilding them.

## Local Next UI request creation

With the configured Next example already running, use the installed Chrome
channel in a separate headless process:

```sh
node tools/runtime/test-next-ui.mjs --base-url http://127.0.0.1:4001 --report /private/tmp/idkit-next-ui-report.json
```

This performs 24 UI configurations: all legacy presets, the v4 presets, three
multi-credential combinators, genesis cutoff, invite code, return URL and user
presence, two create-session variants, two local validation cases, and three
Arena constraint/fallback rows. Each creation uses the real RP-context endpoint
and bridge service. It checks HTTP status, the actual widget connector and QR,
and decrypts the captured outgoing request in memory to check the selected
options. It then closes the widget. Every page starts with `WebAssembly`
unavailable. No shared browser session is used.

To run a subset, add `--only main/poh/invite` (substring matching). Override
`--channel chrome` if needed. Only localhost base URLs are accepted. The script
does not install dependencies, build packages, or start the example server;
prepare the desired packed SDK candidate in the example before running it.

Reports contain case names, stages, HTTP statuses, connector host/type and ID
shape, and invite-code length. They never retain connector URLs, keys, request
IDs, signatures, response bodies, screenshots, or browser traces. Failed cases
report the error type and script line only. The script exits nonzero on failure.

Passing means **request creation, cancellation and local validation passed**.
It does not mean a proof was produced or verified. The configured demo app's
v4 registration and the simulator's invite-ID validator can independently block
proof completion; this smoke deliberately stops before either stage.
