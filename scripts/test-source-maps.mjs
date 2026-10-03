import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(
  new URL("../js/packages/core/package.json", import.meta.url),
);
const { build } = require("tsup");
const tsupRequire = createRequire(require.resolve("tsup"));
const { SourceMapConsumer, SourceMapGenerator } = tsupRequire("source-map");

test("tsup composes exact source locations using its pure JavaScript source-map dependency", async () => {
  assert.equal(tsupRequire("source-map/package.json").name, "source-map-js");
  const directory = mkdtempSync(join(tmpdir(), "idkit-source-map-"));
  const entry = join(directory, "fixture.ts");
  writeFileSync(
    entry,
    "export function example(): never {\n  const marker: number = 42;\n  throw new Error(String(marker));\n}\n",
  );
  const wasm = globalThis.WebAssembly;
  globalThis.WebAssembly = undefined;
  try {
    await build({
      config: false,
      entry: [entry],
      outDir: join(directory, "dist"),
      format: ["esm"],
      platform: "node",
      sourcemap: true,
      silent: true,
      plugins: [
        {
          name: "source-map-composition-check",
          renderChunk(code, chunk) {
            const generator = new SourceMapGenerator();
            const lines = code.split("\n");
            for (let line = 0; line < lines.length; line++) {
              for (let column = 0; column <= lines[line].length; column++) {
                generator.addMapping({
                  generated: { line: line + 2, column: column + 2 },
                  original: { line: line + 1, column },
                  source: chunk.path,
                });
              }
            }
            return {
              code:
                "// shifted output\n" +
                lines.map((line) => "  " + line).join("\n"),
              map: generator.toJSON(),
            };
          },
        },
      ],
    });
    const code = readFileSync(join(directory, "dist/fixture.mjs"), "utf8");
    const lines = code.split("\n");
    const line = lines.findIndex((value) => value.includes("throw new Error"));
    assert(line >= 0, "Build must retain the throw statement");
    const consumer = new SourceMapConsumer(
      JSON.parse(readFileSync(join(directory, "dist/fixture.mjs.map"), "utf8")),
    );
    const original = consumer.originalPositionFor({
      line: line + 1,
      column: lines[line].indexOf("throw"),
    });
    assert.equal(original.source?.split("/").at(-1), "fixture.ts");
    assert.equal(original.line, 3);
    assert.equal(original.column, 2);
  } finally {
    globalThis.WebAssembly = wasm;
    rmSync(directory, { recursive: true, force: true });
  }
});
