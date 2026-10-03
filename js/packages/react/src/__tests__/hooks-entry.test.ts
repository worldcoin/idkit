// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("headless hooks entry", () => {
  it("is independently exported without requiring React DOM as a peer", () => {
    expect(packageJson.exports["./hooks"]).toEqual({
      types: "./dist/hooks.d.ts",
      import: "./dist/hooks.js",
      require: "./dist/hooks.cjs",
    });
    expect(packageJson.peerDependenciesMeta["react-dom"].optional).toBe(true);
  });

  it("loads with only React and core, without browser globals or widget dependencies", () => {
    const source = readFileSync(resolve(packageDir, "dist/hooks.cjs"), "utf8");
    const imports = new Set<string>();
    const module = { exports: {} as Record<string, unknown> };
    const core = {
      createIDKitNamespace: () => ({}),
      IDKitErrorCodes: {},
    };
    runInNewContext(source, {
      module,
      exports: module.exports,
      require: (name: string) => {
        imports.add(name);
        if (name === "react") return {};
        if (name === "@worldcoin/idkit-core") return core;
        throw new Error(`Unexpected headless dependency: ${name}`);
      },
    });
    expect(imports).toEqual(new Set(["react", "@worldcoin/idkit-core"]));
    expect(module.exports.useIDKitRequest).toBeTypeOf("function");
    expect(module.exports.useIDKitInviteCodeRequest).toBeTypeOf("function");
    expect(module.exports.useIDKitSession).toBeTypeOf("function");
    expect(module.exports.IDKitRequestWidget).toBeUndefined();
  });
});
