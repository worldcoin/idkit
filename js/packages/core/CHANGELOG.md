# @worldcoin/idkit-core

## 3.0.7

### Patch Changes

- Add v3 standalone wrapper (non-React) that re-exports core and exposes a minimal QR/polling widget; keep core in 3.0.x line with explicit request API.

## 3.0.6

### Patch Changes

- Add v3 standalone package that re-exports the new request-based core API and wire npm publish for both core and standalone.

## 3.0.5

### Patch Changes

- Expose explicit request-based session creation (per-request `face_auth`, signals, constraints) in JS/WASM to align with Swift/Kotlin and support Orb-or-Face with face auth.
