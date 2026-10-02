import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = (file: string) =>
  readFileSync(resolve(packageDir, "dist", file), "utf8");

describe("published entry compatibility", () => {
  it("bundles the ESM-only signing dependency into both CommonJS entries", () => {
    for (const file of ["index.cjs", "node.cjs"]) {
      expect(dist(file)).not.toMatch(/require\(["']@noble\//);
    }
  });

  it("loads the portable entry without Node, DOM, TextEncoder or crypto globals", () => {
    const module = { exports: {} as Record<string, (...args: any[]) => any> };
    runInNewContext(dist("index.cjs"), { module, exports: module.exports });
    expect(
      module.exports.getSessionCommitment(`session_${"11".repeat(64)}`),
    ).toBe(BigInt(`0x${"11".repeat(32)}`));
    expect(() =>
      module.exports.signRequest({ signingKeyHex: "aa".repeat(32) }),
    ).toThrow("should never be called from browser/client-side code");
    for (const file of ["index.js", "index.cjs"]) {
      expect(dist(file)).not.toMatch(
        /(?:require\(|from\s*)["'](?:node:|crypto["'])/,
      );
    }
  });

  it.each(["commonjs", "module"])(
    "resolves the Node %s entry and signs without changing global crypto",
    (format) => {
      const load =
        format === "commonjs"
          ? 'const { signRequest } = require("@worldcoin/idkit-server");'
          : 'const { signRequest } = await import("@worldcoin/idkit-server");';
      const output = execFileSync(
        process.execPath,
        [
          `--input-type=${format}`,
          "-e",
          `delete globalThis.crypto;
        ${load}
        if (globalThis.crypto !== undefined) throw new Error("Import changed crypto");
        const result = signRequest({ signingKeyHex: "aa".repeat(32) });
        if (globalThis.crypto !== undefined) throw new Error("Signing changed crypto");
        process.stdout.write(JSON.stringify(result));`,
        ],
        { cwd: packageDir, encoding: "utf8" },
      );
      const result = JSON.parse(output);
      expect(result.sig).toMatch(/^0x[0-9a-f]{130}$/);
      expect(result.nonce).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.expiresAt - result.createdAt).toBe(300);
    },
  );
});
