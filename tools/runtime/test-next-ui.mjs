import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

// This is a request-creation smoke, never a proof/verification acceptance test.
// No screenshots, traces, response bodies, connector URLs or keys are retained.
const args = process.argv.slice(2);
assert.equal(args.length % 2, 0, "Expected --option value pairs");
const options = Object.fromEntries(
  Array.from({ length: args.length / 2 }, (_, i) => [
    args[i * 2],
    args[i * 2 + 1],
  ]),
);
for (const key of Object.keys(options))
  assert(
    ["--base-url", "--channel", "--only", "--report"].includes(key),
    "Unknown option",
  );
const base = new URL(options["--base-url"] ?? "http://127.0.0.1:4001");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Only a local example server is supported",
);
const cases = [
  ...["orb", "selfie", "secure_document", "document", "device"].map(
    (legacy) => ({ name: `main/legacy/${legacy}`, legacy }),
  ),
  ...[
    "proof_of_human",
    "selfie",
    "passport",
    "mnc",
    "proof_of_human_or_selfie",
    "identity_check",
  ].map((credential) => ({ name: `main/v4/${credential}`, credential })),
  ...["any", "all", "enumerate"].map((combinator) => ({
    name: `main/multi/${combinator}`,
    credential: "multi",
    combinator,
  })),
  { name: "main/mnc/genesis", credential: "mnc", genesis: true },
  { name: "main/poh/invite", credential: "proof_of_human", invite: true },
  {
    name: "main/poh/return-and-presence",
    credential: "proof_of_human",
    returnTo: true,
  },
  {
    name: "main/create-session/poh",
    flow: "create_session",
    credential: "proof_of_human",
  },
  {
    name: "main/create-session/multi",
    flow: "create_session",
    credential: "multi",
    combinator: "all",
  },
  {
    name: "main/invalid-session",
    flow: "session",
    credential: "proof_of_human",
    validation: "session",
  },
  { name: "main/empty-multi", credential: "multi", validation: "multi" },
  {
    name: "arena/nested-constraints",
    arena: "Proof of Human AND (Passport OR MNC)",
    nested: true,
  },
  {
    name: "arena/legacy-fallback",
    arena: "3.0-only account, fallback enabled",
    fallback: true,
  },
  {
    name: "arena/genesis-cutoff",
    arena: "Genesis cutoff fails, fallback disabled",
    genesis: true,
  },
].filter((test) => !options["--only"] || test.name.includes(options["--only"]));
assert(cases.length, "The filter selected no cases");

function endpoint(request) {
  const url = new URL(request.url());
  if (
    url.origin === base.origin &&
    ["/api/rp-signature", "/api/arena/rp-context"].includes(url.pathname)
  )
    return "rp-context";
  if (url.origin === base.origin && url.pathname === "/api/verify-proof")
    return "proof-verification";
  if (
    url.origin !== base.origin &&
    url.pathname === "/request" &&
    request.method() === "POST"
  )
    return "bridge-create";
  if (
    url.origin !== base.origin &&
    url.pathname.startsWith("/response/") &&
    request.method() === "GET"
  )
    return "bridge-poll";
}

function decrypt(post, connector) {
  const encrypted = Buffer.from(post.payload, "base64");
  const key = Buffer.from(connector.searchParams.get("k"), "base64");
  assert.equal(key.length, 32, "Connector key length");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(post.iv, "base64"),
  );
  cipher.setAuthTag(encrypted.subarray(-16));
  return JSON.parse(
    Buffer.concat([
      cipher.update(encrypted.subarray(0, -16)),
      cipher.final(),
    ]).toString("utf8"),
  );
}

async function configure(page, test) {
  if (test.arena) {
    await page.locator("#arenaEnv").selectOption("staging");
    return page
      .locator("article.test-case-row")
      .filter({
        has: page.getByRole("heading", { name: test.arena, exact: true }),
      })
      .getByRole("button", { name: "Run", exact: true });
  }
  await page.locator("#cfgEnv").selectOption("staging");
  await page.locator("#cfgFlowMode").selectOption(test.flow ?? "request");
  if (!test.flow)
    await page.locator("#cfgWorldID").selectOption(test.legacy ? "3.0" : "4.0");
  await page
    .locator(test.legacy ? "#cfgCredentialv3" : "#cfgCredentialv4")
    .selectOption(test.legacy ?? test.credential);
  if (test.credential === "multi") {
    await page
      .locator("#cfgMultiCombinator")
      .selectOption(test.combinator ?? "any");
    const group = page.getByRole("group", { name: "Credentials", exact: true });
    for (const label of ["PoH", "Selfie", "Passport", "MNC"]) {
      await group
        .getByRole("checkbox", { name: label, exact: true })
        .setChecked(
          test.validation !== "multi" &&
            ["PoH", "Passport", "MNC"].includes(label),
        );
    }
  }
  if (test.credential === "identity_check")
    await page.locator("#cfgIdentityDocumentType").check();
  if (test.genesis) {
    await page.locator("#cfgGenesisEnabled").check();
    await page.locator("#cfgGenesisDate").fill("2020-01-01T00:00");
  }
  if (test.invite) await page.locator("#cfgUseInviteCode").check();
  if (test.returnTo) {
    await page.locator("#cfgReturnToEnabled").check();
    await page.locator("#cfgReturnTo").fill(`${base.origin}/?returned=1`);
    await page.locator("#cfgRequireUserPresence").check();
  }
  if (test.validation === "session")
    await page.locator("#cfgSessionId").fill("not-a-session");
  return page.getByRole("button", {
    name: /^(Verify|Create Session|Prove Session) with /,
  });
}

function checkPayload(payload, connector, test) {
  assert.equal(
    payload.environment,
    "staging",
    "Environment must reach the encrypted payload",
  );
  assert.equal(payload.package_name, "idkit_react", "React facade metadata");
  assert.equal(connector.searchParams.get("t"), "wld", "Connector protocol");
  const proof = payload.proof_request;
  if (test.legacy) {
    assert.equal(
      proof,
      undefined,
      "Legacy preset must keep its legacy wire format",
    );
    assert.equal(
      payload.verification_level,
      test.legacy === "selfie" ? "face" : test.legacy,
    );
  } else {
    assert(proof, "V4 proof request must be encrypted in the bridge payload");
    assert.equal(
      proof.proof_type,
      test.flow === "create_session" ? "session" : "uniqueness",
    );
    const credentials =
      test.nested || test.credential === "multi"
        ? ["proof_of_human", "passport", "mnc"]
        : test.credential === "proof_of_human_or_selfie"
          ? ["proof_of_human", "selfie"]
          : test.credential === "identity_check"
            ? ["passport", "mnc"]
            : [test.credential ?? "proof_of_human"];
    assert.deepEqual(
      proof.proof_requests.map((item) => item.identifier),
      credentials,
      "Selected credentials must reach the encrypted wire payload",
    );
    if (test.flow === "create_session")
      assert.equal(proof.session_id, "create");
    if (test.combinator)
      assert(
        Array.isArray(proof.constraints?.[test.combinator]),
        "Chosen constraint combinator must reach the wire",
      );
    if (test.nested)
      assert(
        proof.constraints?.all?.some(
          (child) => typeof child === "object" && Array.isArray(child.any),
        ),
        "Nested constraints must reach the wire",
      );
    if (test.genesis)
      assert(
        proof.proof_requests.some((item) => item.genesis_issued_at_min > 0),
        "Genesis cutoff must reach the wire",
      );
    if (test.fallback) assert.equal(payload.allow_legacy_proofs, true);
    if (test.credential === "identity_check")
      assert(
        payload.identity_attributes?.length > 0,
        "Identity attributes must reach the wire",
      );
  }
  if (test.invite) {
    assert(
      /^[A-Z0-9]{6}$/.test(connector.searchParams.get("c") ?? ""),
      "Invite code format",
    );
    assert.equal(
      connector.searchParams.get("a"),
      payload.app_id,
      "Invite app attribution",
    );
  } else assert.equal(connector.searchParams.get("c"), null);
  if (test.returnTo) {
    assert.equal(
      connector.searchParams.get("return_to"),
      `${base.origin}/?returned=1`,
    );
    assert.equal(payload.require_user_presence, true);
  }
}

const results = [];
let browser;
try {
  browser = await chromium.launch({
    channel: options["--channel"] ?? "chrome",
    headless: true,
  });
  for (const test of cases) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(globalThis, "WebAssembly", {
        value: undefined,
        configurable: true,
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const row = {
      name: test.name,
      outcome: "failed",
      stage: "navigation",
      http: [],
      page_errors: 0,
    };
    const requests = [];
    page.on("pageerror", () => row.page_errors++);
    page.on("request", (request) => {
      const kind = endpoint(request);
      if (kind) requests.push(kind);
    });
    page.on("response", (response) => {
      const kind = endpoint(response.request());
      if (kind) row.http.push({ kind, status: response.status() });
    });
    try {
      const navigation = await page.goto(
        new URL(test.arena ? "/arena" : "/", base).href,
        { waitUntil: "networkidle" },
      );
      assert(navigation?.ok(), "Local page must load successfully");
      row.stage = "configuration";
      const start = await configure(page, test);
      row.stage = "request-creation";
      if (test.validation) {
        if (test.validation === "session") {
          await start.click();
          await page
            .getByText(
              "Error: Session ID must be in the format session_<128 hex characters>.",
              { exact: true },
            )
            .waitFor();
        } else {
          assert(
            await start.isDisabled(),
            "An empty credential selection must disable creation",
          );
          await page
            .getByText("Select at least one credential.", { exact: true })
            .first()
            .waitFor();
        }
        assert.equal(
          requests.length,
          0,
          "Local validation must not call RP or bridge APIs",
        );
        row.outcome = "local-validation-passed";
      } else {
        const created = page.waitForResponse(
          (response) =>
            endpoint(response.request()) === "bridge-create" &&
            response.status() !== 409,
        );
        void created.catch(() => {});
        await start.click();
        const response = await created;
        assert(response.ok(), "Bridge request creation HTTP status");
        const post = response.request().postDataJSON();
        const createdBody = await response.json();
        row.stage = "widget-connector";
        const dialog = page.getByRole("dialog");
        const link = dialog.locator("a.idkit-deeplink-btn[href]").first();
        await link.waitFor({ state: "attached" });
        const connector = new URL(await link.getAttribute("href"));
        row.connector = {
          host: connector.host,
          transport: test.invite ? "invite" : "url",
          request_id_shape:
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              connector.searchParams.get("i") ?? "",
            )
              ? "uuid"
              : "non-uuid",
          invite_code_length: connector.searchParams.get("c")?.length ?? 0,
        };
        assert.equal(
          connector.searchParams.get("i"),
          createdBody.request_id,
          "Displayed connector must match the real bridge response",
        );
        assert.equal(connector.protocol, "https:");
        assert.equal(
          await dialog.locator('[data-test-id="qr-code"]').count(),
          1,
          "Widget must render the connector QR",
        );
        checkPayload(decrypt(post, connector), connector, test);
        if (test.invite)
          await dialog
            .getByText(connector.searchParams.get("c"), { exact: true })
            .waitFor();
        row.stage = "cancellation";
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await dialog.waitFor({ state: "detached" });
        if (test.name === "main/v4/proof_of_human") {
          const count = requests.filter(
            (kind) => kind === "bridge-poll",
          ).length;
          await page.waitForTimeout(1500);
          assert.equal(
            requests.filter((kind) => kind === "bridge-poll").length,
            count,
            "Closing the widget must stop scheduled polls",
          );
        }
        assert(
          row.http.some(
            (item) =>
              item.kind === "rp-context" &&
              item.status >= 200 &&
              item.status < 300,
          ),
          "RP context endpoint must succeed",
        );
        row.outcome = "created-and-cancelled";
      }
      assert.equal(row.page_errors, 0, "No unhandled page errors");
      assert(
        await page.evaluate(() => globalThis.WebAssembly === undefined),
        "WebAssembly must remain unavailable",
      );
      assert(
        !requests.includes("proof-verification"),
        "Smoke must stop before proof verification",
      );
      row.stage = "complete";
    } catch (error) {
      // Playwright errors can contain complete hrefs; retain only safe metadata.
      row.outcome = "failed";
      row.error_type = error?.name ?? "Error";
      row.error_line =
        Number(error?.stack?.match(/test-next-ui\.mjs:(\d+):/)?.[1]) ||
        undefined;
    } finally {
      await context.close();
    }
    results.push(row);
    console.log(JSON.stringify(row));
  }
} catch (error) {
  results.push({
    name: "runner",
    outcome: "failed",
    stage: "browser-launch",
    error_type: error?.name ?? "Error",
  });
} finally {
  await browser?.close();
}
const report = {
  scope:
    "Real local UI and bridge request creation, cancellation, and local validation only; no proof or verification success is tested.",
  known_external_limits:
    "Configured demo app registration and simulator invite validation may block proof completion; this script never enters that stage.",
  results,
};
if (options["--report"])
  writeFileSync(options["--report"], JSON.stringify(report, null, 2) + "\n");
const failed = results.filter((row) => row.outcome === "failed").length;
console.log(
  `Next UI creation smoke: ${results.length - failed}/${results.length} passed; proof verification not attempted.`,
);
if (failed) process.exitCode = 1;
