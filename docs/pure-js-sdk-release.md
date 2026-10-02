# Pure JavaScript SDK ship plan

Decision: retain the native Rust compatibility runner, checked-in fixtures, live
differential tests, and JavaScript/React API tests in this repository. A
maintained WASM SDK, separate compatibility repository, and new WASM comparison
suite are not required to ship.

The combined migration is being prepared as a review draft on October 2 at
`6d6e4558`, rebased onto main `b8387bdf`. Current source checks and historical
September 28–29 runtime/simulator results are recorded separately in
[the validation report](pure-js-sdk-validation.md). The earlier tarballs do not
qualify this draft's newer polling/cancellation behavior or future release
artifacts. The six-PR split below is a proposed follow-up review structure,
not a committed delivery sequence.

## Implementation status

| Area             | Present in the prototype                                                                                                           | Still required                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Compatibility    | Native runner, 295 core fixtures, generated cases, signing fixtures, adapter defaults and public declaration checks                | Validate each staged PR and review deliberate fixture changes             |
| Protocol         | TypeScript crypto, codecs, request compilation, response conversion, raw bridge JSON parsing                                       | Focused protocol and malformed-input review                               |
| Transport        | JavaScript bridge, shared Mini App protocol code, 11 HTTP creation scenarios and 91 polling steps; bounded JS timeout/cancellation | Remaining live proof and device matrix                                    |
| Portability      | Portable server/core entries, Node entropy adapter, React `/hooks`, optional React DOM peer                                        | Metro builds and Android/iOS qualification on declared supported versions |
| Packaging and CI | SDK dependency audit, isolated example/runtime tooling, packed runtime gates, final-tarball qualification and publication          | Activate required repository checks after workflows exist remotely        |

Implementation claims above are source-inspected. September 29 hosted-simulator
runs additionally established real backend acceptance for staging v4 Human, v4
Passport, Human AND Passport, Human OR Passport, Enumerate Human + Passport, and
legacy Orb, plus a fresh request after an invalid-signature rejection. These
seven completions used the exact packed SDKs in the local production Next build
and returned HTTP 200 with `success: true` from the default
`developer.world.org` verifier, without mocks or an override.

WebAssembly was disabled once after page load, before the first flow, and
remained unavailable throughout the runs. The corrected app ID and completed
Portal PR #2357 deployment resolved the earlier registration and staging-policy
blockers; see the validation report for actions and deployment evidence.

An invalid-signature negative case also passed, propagating
`invalid_rp_signature` from the simulator through the bridge to the SDK. Session
creation currently fails in the hosted sidecar before backend verification. The
emitted create sentinel matches Rust; the failure is consistent with the older
parser in the local simulator checkout, without establishing which version is
deployed. These results do not qualify the remaining live matrix, Metro builds
or device handoff.

## Review and PR sequence

The full migration is presented together for initial draft review. If a later
review calls for splitting it, the following six-PR structure is a proposal.
Validate every intermediate head, not only the combined result. In that split,
PRs 1–5 would leave the existing public core engine active; PR 6 would switch it
after replacement checks are ready.

| PR                                 | Scope                                                                                                                    | Merge evidence                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1. Native compatibility foundation | Feature-gated runner, narrow shared Rust helpers, fixtures/manifest generation, contract documentation                   | Deterministic fixture generation; no dependency on future JS modules; keep the polling-policy change with transport |
| 2. Server portability              | Portable exports, Node entropy fallback, signing fixtures, import behavior                                               | Packed ESM/CJS signing and imports; portable import does not load Node builtins                                     |
| 3. Portable primitives             | Crypto, codecs, runtime providers, URL behavior, standalone types                                                        | Relevant Rust vectors, entropy failure behavior, runtime checks                                                     |
| 4. Protocol implementation         | Requests, presets, constraints, sessions, response/claim/proof conversion, strict wire parsing                           | Fixed/generated differential cases, public declaration and error-boundary tests                                     |
| 5. Bridge transport                | Creation, encryption, invite retries, polling, connector URLs, debug reports                                             | HTTP scenarios through completion/failure and JS timeout/cancellation contracts                                     |
| 6. SDK cutover and release         | Switch facade/Mini App compiler, expose hooks, remove SDK WASM build/setup, activate package/runtime/release gates, docs | Full candidate gate, dependency/artifact checks, required CI checks before stable release                           |

The current JS conformance dispatcher and corpus construction import the new
crypto/protocol modules. They cannot be copied unchanged into PR 1. Keep that
foundation native-only, then add JS comparisons with the corresponding modules.
Retain the full final gate before cutover.

React stale-result protection may be reviewed separately: cancelled creation
must not overwrite the active request handle. Network abort propagation also
depends on core's new request options, so keep those call sites with the
matching transport API. A hung creation or poll must not outlive the flow
deadline. Keep example/documentation changes with their features; optional UI
work is separate.

## Remaining engineering gates

- [x] Preserve the prototype and refresh the combined draft against current main.
- [x] Pin development and CI to pnpm 9.15.4; regenerate and check the separate
      SDK, Next example, and runtime-tooling lockfiles.
- [x] Characterize JS-adapter defaults: omitted versus false flags, environment
      normalization, null/omission, safe integers, and public rejections.
      Preserve intentional JS/FFI differences; unifying their config mappers is
      optional.
- [x] Compare relevant exported TypeScript enums/result shapes with Rust-derived
      contracts beyond current credential IDs, errors, and preset tags. State
      the limits of curated manifest coverage; schema generation is not
      required.
- [ ] Review crypto/encoding, request/result conversion, and malformed-input
      behavior with a Rust/protocol reviewer. Test adapters must delegate
      protocol behavior to production functions; fixture changes remain
      explicit.
- [x] Extend Rust/JS HTTP comparisons beyond creation: waiting, confirmation,
      completed encrypted response, rejection, malformed response, and transport
      failures. Separately cover JS polling timeout, cancellation, and stale
      work.
- [x] Close the SDK npm dependency boundary, including development, optional,
      and transitive packages. Next and Miniflare have separate installs in this
      repo. The scoped tsup patch replaces its WASM-backed source-map dependency
      with `source-map-js`; a source-map composition regression test covers the
      patch.
- [x] Scan complete tarball contents and resolved dependency graphs for SDK WASM
      assets/loaders. Verify portable core/hooks do not require Node builtins,
      DOM, or `crypto.subtle`; explicit Node entries/web widgets keep host APIs.
- [x] Remove Rust/WASM invocations from JS installation, builds, and ordinary
      tests. Only native conformance needs Rust. Existing optional Rust target
      bindings are a separate support surface, not an npm SDK dependency; audit
      consumers before unrelated removal.
- [x] Implement final versions/dependency pins before building, one build/pack,
      source SHA and digest verification, and publication of qualified tarballs.
      Real local build/pack/verification passed; registry publication is
      untested.
- [x] Propagate the same `dev.g<SHA>` candidate suffix through server, core, and
      React. Check actual registry prerequisites and target-only consumer
      installs without local overrides, for stable releases and prereleases.
- [ ] Require native conformance and applicable package/runtime checks in actual
      repository rules. Workflow wiring alone is not branch protection.

Main branch protection currently has no required status-check contexts. Activate
the new jobs after the PR/workflows exist remotely; requiring nonexistent jobs
now would block unrelated repository work. Publication still requires choosing
new package versions and successfully executing the remote qualification gate.

Timeout/cancellation settles core and React wrappers, stops subsequent polling
and sends an abort signal to the underlying bridge fetch and response-body
read. It still settles if a custom adapter ignores abort. Transient network/body
failures and HTTP 408, 429 and 5xx polls retry within the original deadline.
Rust now also classifies those HTTP statuses as retryable bridge errors instead
of terminal connection failures. This is an intentional shared polling-policy
change; serialized protocol formats remain unchanged.

## Candidate qualification

Record the final source revision, tarball digests, fixture seed, results, and
runtime versions. Run against the prepared candidate packages:

The September 28 local build passed the automated SDK, Rust, packed runtime and
Hermes checks below. The validation report distinguishes those historical
digests from October 2 checks of the current source. These boxes remain
release-candidate requirements and must be rerun after version stamping on the
eventual committed source revision.

- [ ] Frozen install, build, types, formatting, JS unit/API tests, and Rust
      tests/checks appropriate to changed shared production code.
- [ ] Live Rust comparison, retained fixtures/manifest, generated inputs,
      signing parity, and HTTP comparisons.
- [ ] Packed Node ESM/CJS on 18/22/24 (or the explicitly revised supported
      matrix), Chromium ESM/IIFE, and Worker execution.
- [ ] Hermes fixtures/built entries, then actual Metro builds for supported Expo
      and bare RN integrations. Custom runner transforms do not prove Metro
      works.
- [ ] Android/iOS World App handoff and return, actual backend proof acceptance,
      request/session/invite/Self Check flows, cancellation/reset,
      background/resume, rejection, expired context, and network interruption.
      Follow the
      [native procedure](../js/examples/react-native-smoke/README.md).
- [ ] Existing browser widgets and Mini App transport on supported protocol
      versions, including backend verification. Mini App postMessage and RN's
      HTTP bridge are different acceptance paths.

Initial RN scope is core plus headless hooks, with app-owned UI, linking, and
return URL registration. Document supported RN/Expo versions and secure entropy
setup. Pure JS crypto needs host-provided randomness; claim zero-setup support
only for environments that actually provide it. Device acceptance needs devices,
test accounts, a configured test app, fresh RP contexts, and a backend verifier.

## Release order and rollback

1. Choose versions/release notes from the public API and engine contract diff.
   Use a major bump for intentional breaking changes, not merely a rewrite.
2. Qualify a coherent candidate set and publish prereleases in dependency order:
   `@worldcoin/idkit-server` → `@worldcoin/idkit-core` → `@worldcoin/idkit`. Pin
   exact candidate dependency versions.
3. Complete prerelease consumer/device acceptance. Prepare stable versions/pins
   and requalify those exact stable tarballs before publishing in the same
   order; prerelease success does not qualify subsequently rewritten manifests.
4. Confirm clean registry installs resolve intended versions. Retain previous
   releases and record how to restore prior dist-tags or consumer pins. Do not
   unpublish the previous release.

Stable release requires all applicable engineering and acceptance gates above.
No permanent WASM SDK, separate repository, native widget rewrite, general
schema generator, or public engine-selection flag is part of this plan.
