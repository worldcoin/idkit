import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Run after building server, core, and React; each import gets a fresh process.
for (const [directory, name] of [
  ["server", "@worldcoin/idkit-server"],
  ["core", "@worldcoin/idkit-core"],
  ["react", "@worldcoin/idkit"],
]) {
  const cwd = fileURLToPath(
    new URL(`../packages/${directory}/`, import.meta.url),
  );
  for (const subpath of ["", "/nullifier"]) {
    const specifier = name + subpath;
    for (const format of ["esm", "cjs"]) {
      const load =
        format === "esm"
          ? `const { Nullifier } = await import(${JSON.stringify(specifier)});`
          : `const { Nullifier } = require(${JSON.stringify(specifier)});`;
      const check = `${load}
        if (Nullifier.fromHex("0x01A").toBigInt() !== 26n) throw new Error("Wrong number");
        const canonical = "nil_" + "0".repeat(62) + "1a";
        if (Nullifier.fromHex("0x1a").toCanonicalString() !== canonical) throw new Error("Wrong canonical string");
        if (Nullifier.fromCanonicalString(canonical).toBigInt() !== 26n) throw new Error("Wrong canonical number");
        if (JSON.stringify(Nullifier.fromHex("0x1a")) !== JSON.stringify("0x" + "0".repeat(62) + "1a")) throw new Error("Wrong JSON");
      `;
      execFileSync(
        process.execPath,
        [
          "--input-type=" + (format === "esm" ? "module" : "commonjs"),
          "-e",
          check,
        ],
        { cwd },
      );
      if (subpath && format === "cjs") {
        execFileSync(
          process.execPath,
          [
            "-e",
            `${load}
          const forbidden = Object.keys(require.cache).filter(p =>
            ["/wasm/", "/node_modules/react/", "/node_modules/react-dom/"].some(part => p.includes(part)) ||
            ["/signing.js", "/signing.cjs"].some(name => p.endsWith(name))
          );
          if (forbidden.length) throw new Error("Standalone import loaded unrelated modules: " + forbidden);
        `,
          ],
          { cwd },
        );
      }
    }
  }
}

const code = readFileSync(
  new URL("../packages/core/dist/idkit.global.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({ TextEncoder, TextDecoder, URL, console });
vm.runInContext(code, context);
assert.equal(context.IDKit.Nullifier.fromHex("0x1A").toBigInt(), 26n);
const canonical = "nil_" + "0".repeat(62) + "1a";
assert.equal(
  context.IDKit.Nullifier.fromHex("0x1a").toCanonicalString(),
  canonical,
);
assert.equal(
  context.IDKit.Nullifier.fromCanonicalString(canonical).toBigInt(),
  26n,
);
assert.equal(typeof context.IDKit.request, "function");
console.log(
  "Nullifier root/subpath exports passed in ESM, CommonJS, and browser without WASM initialization.",
);
