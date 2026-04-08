import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cjsPath = resolve(__dirname, "../../dist/index.cjs");

/**
 * @noble/secp256k1 v2+ is intentionally ESM-only (see https://github.com/paulmillr/noble-secp256k1/issues/115).
 * Our CJS consumers (e.g. bundlers outputting CommonJS) hit ERR_REQUIRE_ESM if the dep is left as an
 * external require(). We solve this via `noExternal` in tsup.config.ts to inline the code at build time.
 * These tests guard against regressions.
 */
describe("CJS bundle compatibility", () => {
  it("should not contain require() calls to ESM-only @noble/secp256k1", () => {
    const content = readFileSync(cjsPath, "utf-8");
    expect(content).not.toMatch(/require\(["']@noble\/secp256k1["']\)/);
  });

  it("should be loadable via require()", async () => {
    const mod = await import(cjsPath);
    expect(mod).toBeDefined();
    expect(typeof mod.signRequest).toBe("function");
  });

  it("should call signRequest without crypto errors", async () => {
    const mod = await import(cjsPath);
    const result = mod.signRequest({ signingKeyHex: "aa".repeat(32) });
    expect(result.sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(result.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.createdAt).toBeTypeOf("number");
    expect(result.expiresAt).toBeTypeOf("number");
  });
});
