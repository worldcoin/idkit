# IDKit Next.js Example

This example demonstrates end-to-end World ID verification with:

- `@worldcoin/idkit` widget request flow
- `@worldcoin/idkit-core` server RP signature generation
- Next.js API routes for RP signature + proof verification

The SDK builds are JavaScript-only. Next.js does not need WASM asset tracing,
custom loaders or an IDKit-specific `serverExternalPackages` setting.

The UI includes request buttons matching the browser example presets:

- Orb Legacy
- Secure Document Legacy
- Document Legacy
- Device Legacy
- Selfie Check Legacy

For World ID 4.0 requests and sessions, the `Credential` select also offers
`Multiple credentials`. Pick any subset of Proof of Human, Selfie, Passport and
My Number Card, then choose how they combine:

- `Any (OR)`: World App satisfies the request with the first selected
  credential the account holds (selection order is priority).
- `All (AND)`: every selected credential is required.
- `Enumerate`: every selected credential the account holds is included; at
  least one is required.

The request is built with IDKit's `any()`, `all()` and `enumerate()` helpers
around `CredentialRequest(...)` (see `app/multi-constraints.ts`), and the exact
constraint tree is previewed in the configuration panel before you start.

The `/arena` route includes grouped mobile implementation test cases for
World ID 3.0 presets, World ID 4.0 constraints, migration fallback behavior,
and 4.0 error handling.

## Run

From repo root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm -C js/examples/nextjs install --frozen-lockfile
cp js/examples/nextjs/.env.example js/examples/nextjs/.env.local
corepack pnpm -C js/examples/nextjs dev
```

Open `http://localhost:4001`.

This example installs separately so Next.js tooling stays outside the SDK dependency
graph. Its SDK dependencies link to the local packages; rebuild those packages
after making changes. Next.js tooling can include optional WASM variants, while
the SDK itself has no WASM assets.

## Eruda

[Eruda](https://github.com/liriliri/eruda) is enabled by default for this
example so you can inspect the console inside World App.

## Cloudflare Workers

The example uses OpenNext on the `idkit-example-dev` Worker. Cloudflare Workers
Builds builds the SDK packages first, then installs and builds this example as
its own pnpm workspace. `main` deploys the shared example; other branches upload
preview versions protected by the infrastructure module's employee Access policy.
The two pages use Workers Static Assets for the prerender cache; this example has
no ISR or on-demand revalidation and needs neither R2 nor a cache Durable Object Worker.

From the repository root, after installing and building the SDK:

```bash
corepack pnpm -C js/examples/nextjs install --frozen-lockfile
corepack pnpm -C js/examples/nextjs build:cloudflare
corepack pnpm -C js/examples/nextjs preview:cloudflare
```

Set the public app/RP IDs in `.env.local` before building locally. Put the local
test `RP_SIGNING_KEY` in `.dev.vars` for the Workers preview runtime. Both files
are ignored by Git. Never use a production signing key for local tests.

### Initial rollout

1. Apply the companion infrastructure change through TFE. It creates the Worker,
   preview Access policy, Cloudflare GitHub integration, organization
   token access, and the `cloudflare-example` GitHub environment. Only `main` may
   use that environment, with approval from the Developers team.
2. Confirm the public IDs in the root `cf-worker-config.json` match the existing
   Vercel deployment. They initially match this example's `.env.example`.
   Confirm the Workers Builds token belongs to the same dedicated Cloudflare
   user as the organization `CLOUDFLARE_API_TOKEN`. If multiple tokens exist, pin
   the approved token's UUID as `build_token_uuid` in the Worker config.
3. Provision `RP_SIGNING_KEY` in the `cloudflare-example` GitHub environment
   through Terraform. Copy the existing value from Vercel using a local hidden
   prompt; do not put it in a PR, chat, or a command argument. After the environment
   exists, encrypt locally without storing it in GitHub:

   ```bash
   gh api repos/worldcoin/idkit/environments/cloudflare-example/secrets/public-key --jq .key_id
   gh secret set RP_SIGNING_KEY --repo worldcoin/idkit --env cloudflare-example --no-store
   gh api repos/worldcoin/idkit/environments/cloudflare-example/secrets/public-key --jq .key_id
   ```

   Both key IDs must match. Give Infra only the ciphertext, key ID, secret name,
   repository, and environment for a reviewed Terraform environment-secret
   resource. Re-encrypt if the key changes. Terraform then delivers the encrypted
   value to GitHub through TFE; the plaintext does not enter Terraform state.

4. Merge the application change and approve **Cloudflare example configuration**.
   This reconciles build settings and starts a Workers Build. Manual runs default
   to `plan`; select `plan-and-apply` on `main` to reconcile again. Pull requests
   never run this privileged workflow.
5. After the first application deployment, run **Cloudflare example runtime
   secrets** on `main`. Run it again only when the GitHub signing key changes.
   If Cloudflare rejects the sync because the latest version is not deployed,
   deploy the intended version before retrying.
6. Validate `/`, `/arena`, RP signing, and proof verification at
   `https://idkit-example-dev.worldcoin.workers.dev`, including a World App flow.
   If the existing Arena deployment uses `TEST_INACTIVE_RP_ID`,
   `TEST_UNKNOWN_RP_ID`, or `TEST_INACTIVE_RP_SIGNING_KEY`, migrate those settings
   before validating the corresponding cases. Public runtime values belong in
   `wrangler.jsonc`; declare additional secrets in `runtime_secrets`, provision
   them through Terraform, and map them explicitly in the secret-sync workflow.
7. After application-owner approval, update the repository homepage and any
   links to the Vercel URL, then disconnect the Vercel integration and remove
   `vercel.json`. The `vercel.app` hostname cannot move to Cloudflare. Until that
   cutover, Vercel stays available as the rollback target.

The deployment is a single shared example, so there is no separate production
promotion branch. Add one only if the example needs independently promoted
environments.
