# Pure JavaScript SDK validation

Current PR-preparation status was updated on October 2, 2026. This report
separates current source checks from historical September 28–29 packed-runtime
and hosted-simulator qualification. No release has been published, and real
device acceptance remains outstanding.

## October 2 PR preparation

The combined migration is prepared for a review draft on
`takis/pure-js-idkit`, rebased onto main
`b8387bdf8e16635301c7d2848518a57f66ea7341`. The six-PR split in the ship plan is
a proposed review follow-up, not a committed delivery sequence.

The initial migration commit is `6d6e4558`. Follow-up checks found and fixed a
mixed-module runtime configuration bug on Node 18 and missing async lowering
in the standalone Hermes corpus harness. Module entries now share one internal
runtime module; the browser IIFE remains self-contained. Release workflows also
validate full main-branch commit SHAs before writing outputs, with regression
coverage for output injection. The isolated runtime tooling's Undici dependency
was patched to 7.29.1.

Since the September qualification, polling and cancellation behavior changed:
transient poll failures retry within the original deadline, and cancellation
and timeouts propagate an abort signal to bridge fetches, including pending
response-body reads. Wrappers still settle if a custom fetch adapter ignores
that signal. Rust and JavaScript intentionally agree that HTTP 408, 429 and 5xx
poll responses are retryable transport errors rather than terminal connection
failures. The wire formats are unchanged.

| Current-source check                                   | October 2 result                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| SDK build, typecheck, JS formatting                    | Passed                                                                                              |
| Ordinary JavaScript tests                              | 599 passed: server 74, core 469, React 56; four live-oracle cases skip without the oracle           |
| Live native conformance                                | 304 passed, plus 11 HTTP creation scenarios and 91 polling steps across five lifecycles             |
| SDK dependency audit                                   | 345 locked packages and 14,372 installed paths; no WASM packages/assets                             |
| Release, dependency audit and source-map tooling tests | 12 passed                                                                                           |
| Rust core tests with conformance feature               | 162 passed                                                                                          |
| Rust formatting and Clippy                             | Passed, all targets/features, warnings denied                                                       |
| Freshly packed Node 18.20.8 and 24.7.0                 | CJS/ESM passed; mixed ESM/CommonJS under Node and React Native conditions shares configured runtime |
| Freshly packed Chromium ESM/hooks/IIFE and workerd     | Passed; WebAssembly absent in Chromium, no Worker Node compatibility flag                           |
| Hermes from React Native 0.79.2                        | 295 fixtures and built core/hooks smoke passed                                                      |

The September tarball digests below are historical and do not identify or
qualify the current draft. Node 22 was not rerun locally on October 2;
its results below retain their September 28 scope. Hosted-simulator proof
acceptance and device E2E were not rerun on October 2; the recorded live results
retain their original dates and scope.

The Vercel preview is blocked before installation/build because the project
still selects discontinued Node.js 20. No project-wide runtime setting was changed.
The draft's GitHub CI and CodeQL checks must rerun on the final pushed revision.

## Gaps closed

- Native Rust remains the compatibility oracle. The retained core corpus grew
  from 244 to 295 cases: 51 additions, zero removed or changed existing results.
  Added cases cover adapter defaults and valid session/Selfie session paths.
- Public TypeScript declarations are checked against Rust-derived result types,
  optionality, enums and typed array elements. `test:conformance` runs
  TypeScript checking after optional manifest regeneration.
- HTTP comparisons call real native creation and polling functions, retaining
  each connection across its transcript: 11 creation scenarios and 91 polling
  steps across five lifecycles. Coverage includes encrypted completion,
  rejection, presence failure, HTTP failures, malformed/duplicate JSON,
  connection loss, authentication failure and post-error reuse.
- Core and React deadlines settle hung creation/polling work, stop further
  polling and ignore late results after cancellation. They now propagate abort
  signals to the host fetch. Matching Rust/JS transient-poll classification is
  an intentional behavior change; serialized protocol formats are unchanged.
- SDK development uses pnpm 9.15.4. Next and browser/Worker test tooling have
  separate installs and lockfiles inside this repository. A narrowly scoped tsup
  patch replaces `source-map`'s WASM implementation with `source-map-js`;
  composed source-map positions are covered by a regression test.
- Release workflows stamp a coherent version vector before building, build and
  pack once, record source SHA and SHA256 digests, qualify the exact artifacts,
  check real registry prerequisites, and publish those same tarballs.

## Historical automated validation — September 28

Checks below ran after the final SDK build on September 28:

| Check                                                  | Result                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| SDK build, typecheck, JS formatting                    | Passed                                                                                                  |
| Ordinary JavaScript tests                              | 552 passed: server 74, core 429, React 49; four live-oracle cases intentionally skip without the oracle |
| Live native conformance                                | 304 passed, plus 11 HTTP creation scenarios and 66 polling steps                                        |
| SDK dependency audit                                   | 345 locked packages and 14,369 installed paths; no WASM packages/assets                                 |
| Release, dependency audit and source-map tooling tests | 11 passed                                                                                               |
| Rust core tests with conformance feature               | 161 passed                                                                                              |
| Rust formatting and Clippy                             | Passed, all targets/features, warnings denied                                                           |
| Packed Node CommonJS/ESM                               | Passed on 18.20.8, 22.23.3 and 24.7.0                                                                   |
| Chromium ESM/IIFE and workerd                          | Passed; WebAssembly unavailable in Chromium, no Worker Node compatibility flag                          |
| Hermes from React Native 0.79.2                        | 295 fixtures and built core/hooks async smoke passed                                                    |

The packed consumers exercise real imports, hashing, signing, request creation,
polling and invite creation. They assert emitted package versions and shared
runtime configuration between core and hooks. Hermes runs without host crypto,
URL or UTF-8 globals; tests provide deterministic entropy only inside the
harness.

The same September 28 tarball bytes were tested by all three Node runtimes and the portable
runtime gate, then copied into the isolated Next example. All 66 installed SDK
files matched those archives byte-for-byte, with the same React → core → server
dependency closure. They are retained in `/private/tmp/idkit-final-candidate`
with `sha256.json`. These working versions and digests identify that historical
dirty-tree build; they are neither published candidates nor the current PR build.

| Package                   | Version | SHA256                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `@worldcoin/idkit-server` | 1.1.1   | `e7c9c5872ba0506cce837295aa4dc5770d9bd124652f46600fabb2518789d462` |
| `@worldcoin/idkit-core`   | 4.3.0   | `a16daedb3f8cfc40a8afd6c8d04f91e7dc55a33a56be136d5faf17b98efd849e` |
| `@worldcoin/idkit`        | 4.3.0   | `37eb41c90fc96e214187241caa32622384a3dffd42f18df372b0a66e9a6b07c8` |

## Historical local Next.js and hosted simulator — September 28–29

The Next.js 15.5.25 production build, typecheck and static generation passed.
The production server at `http://127.0.0.1:4001` used the exact packed SDK
candidates above and the existing, ignored `.env.local` configuration. The
corrected app is `app_75c2486e930cb8c0026266335c869b7a`, with RP
`rp_9b6853dacd0dbcb1`. No private signing key is copied into tracked files or
this report.

On September 29, the actual hosted simulator at
`https://simulator.worldcoin.org/id/0x18310f83` completed the following staging
flows. Each used the real encrypted bridge and the default backend verifier at
`developer.world.org`, with no verifier override or mocks. `WebAssembly` was set
to `undefined` once **after page load and before the first flow**, and remained
undefined throughout the runs. These tests do not establish that page
initialization works with WebAssembly disabled.

| Scenario                         | Action                             | Observed backend result                                                      |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| v4 Proof of Human                | `idkit-js-e2e-poh-0929-0815`       | HTTP 200, `success: true`; protocol `4.0`, `proof_of_human`                  |
| v4 Passport                      | `idkit-js-e2e-passport-0929-0817`  | HTTP 200, `success: true`; protocol `4.0`, `passport`                        |
| v4 Human AND Passport            | `idkit-js-e2e-all-0929-0818`       | HTTP 200, `success: true`; both credential results succeeded                 |
| Legacy Orb                       | `test-action`                      | HTTP 200, `success: true`; protocol `3.0`, `orb`                             |
| v4 Human OR Passport             | `idkit-js-e2e-any-0929-0821`       | HTTP 200, `success: true`; selected `proof_of_human`                         |
| v4 Enumerate Human + Passport    | `idkit-js-e2e-enumerate-0929-0823` | HTTP 200, `success: true`; protocol `4.0`, both credential results succeeded |
| Recovery after invalid signature | `idkit-js-e2e-retry-0929-0830`     | HTTP 200, `success: true`; protocol `4.0`, `proof_of_human`                  |

These seven completions cover six request configurations and one recovery run,
including proof generation, SDK decoding and backend acceptance. The hosted
simulator labels the combined request “Unique device” even when the decoded
protocol and verifier results identify the selected credentials; its display
label is not the basis for the results above. This table records completed,
verified successes; the remaining matrix below is still required.

Session creation failed before backend verification. The simulator's
`POST /api/sidecar/proof/session` returned HTTP 400:

```json
{
  "error": "invalid proof_request: session id must start with 'session_' at line 1 column 416",
  "error_code": "bad_request"
}
```

The simulator published an error to the bridge (HTTP 201); the SDK showed
`Verification failed: generic_error`. No `/api/verify-proof` call occurred. Both
the native Rust core and pure-JS compiler emit `proof_type: "session"` with the
`session_id: "create"` sentinel. The local simulator checkout pins
`world-id-primitives` 0.11.0, whose session parser accepts a typed `SessionId`
and rejects this sentinel. The SDK's Rust reference uses 0.14.0, which supports
it. The hosted failure is consistent with that older parser, and the SDK request
matches Rust. The deployed simulator's package version has not been
independently verified.

The invalid-signature negative test also passed: Portal proof-context returned
HTTP 200, then the simulator uniqueness sidecar rejected the request with HTTP
400 and both `error` and `error_code` equal to `invalid_rp_signature`. The
bridge delivered that error and the SDK showed
`Verification failed: invalid_rp_signature`. No `/api/verify-proof` call
occurred. This qualifies the expected rejection and error propagation,
separately from the seven successful backend verifications. For the recovery row
above, the widget was closed after this error, signature corruption was
disabled, and a fresh action/request completed successfully through the
simulator and default backend verifier.

### Earlier request-construction sweep

The September 28 production build passed a reusable 24-configuration Playwright
sweep with `WebAssembly` disabled **before page load**:

- 22 real bridge requests were created, inspected and cancelled: five legacy
  presets; six v4 choices; `any`/`all`/`enumerate`; genesis cutoff; invite;
  return URL/user presence; two create-session cases; and three Arena cases for
  nested constraints, fallback and genesis cutoff.
- Two local validations passed: malformed session ID and empty credential set.
- All recorded RP-context, bridge-create and poll responses were HTTP 200; there
  were no unhandled page errors. Outgoing requests were decrypted in memory to
  check selected options; reports exclude keys, signatures and request bodies.
- One test-only locator was made unambiguous and its local-validation case was
  rerun. Product code did not change after qualification.

Run
`node tools/runtime/test-next-ui.mjs --base-url http://127.0.0.1:4001 --report /private/tmp/idkit-next-ui-report.json`
with the example running. The sanitized JSON report is retained at that path.
This sweep stops before proof generation: its 24 passes do not establish backend
proof acceptance.

### Resolved setup and deployment blockers

The initial September 28 requests reached the bridge but Portal returned HTTP
400 `not_registered`, shown by the simulator as “App not found.” The copied
`.env.local` app ID ended in `…869b7b`; Portal lookup by the configured RP
identified the registered app ending in `…869b7a`. This one-character mismatch
caused the error, not missing registration for the intended app. Only the
worktree's ignored app ID was corrected; the RP, signing key and primary
checkout were unchanged. Metadata lookup then returned HTTP 200 and the
simulator reached consent.

A subsequent corrected v4 Proof of Human attempt delivered and decoded its
proof, but the verifier returned HTTP 403 `environment_not_allowed` (“Staging
verification is not open for this app.”). Portal PR #2357 removed this server
policy gate. Deployment execution `e114124a-2d76-423a-a61b-914345442421`,
carrying revision `42daf383d`, completed production web deployment on September
28 at 13:39:29 UTC. The September 29 acceptance results above confirm the
earlier gate is no longer blocking these staging proofs. No staging window or
policy setting was changed for the tests, and staging proofs were not relabelled
as production.

The September 28 sandbox and invite connectors were rejected by the simulator
before retrieval, although the SDK created their requests. Those client paths
remain unqualified by the successes above. In a separate Passport attempt, the
simulator's Cancel button dismissed consent without delivering a rejection to
the bridge. Closing the local widget stopped polling; that observation does not
qualify remote-rejection handling. Malformed-RP and invalid-timestamp Arena
checks produced the expected local error codes.

The remaining live matrix includes other credentials and constraint outcomes
(including unavailable credentials), sessions, user presence, expired contexts,
duplicate nonces, nullifier replay, remote rejection and other recovery/network
interruption cases. Invite and sandbox acceptance still need a client that
executes those connectors. An inactive-RP case requires an explicitly configured
inactive test RP.

## Remaining release acceptance

- Review the combined draft against current main and decide whether to split
  follow-up PRs; choose actual release versions. The working versions are not
  newly published release candidates.
- Obtain protocol/crypto review of the Rust-to-JavaScript translation.
- Activate required status checks after the new workflows exist remotely. Main
  currently has no required status-check contexts; changing this to unpublished
  jobs would block unrelated PRs.
- Complete the remaining real simulator/World App matrix. The seven September 29
  staging successes qualify their recorded scenarios, not every credential,
  session, invite, negative case or device flow.
- Run actual Metro/Expo/bare RN builds and Android/iOS handoff, return,
  background/resume and backend verification. Standalone Hermes does not cover
  those host integrations.
- Execute release qualification and actual registry/OIDC publication for the
  chosen immutable source revision. No publishing was performed in this pass.
