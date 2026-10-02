import { resolve } from "node:path";

/** Keep configuration state shared by ESM, CommonJS and Node package entries. */
export function sharedRuntimePlugin(runtimeModule) {
  return {
    name: "idkit-shared-runtime",
    setup(build) {
      build.onResolve({ filter: /\/runtime(?:\.ts)?$/ }, (args) => {
        const path = resolve(args.resolveDir, args.path);
        if (path === runtimeModule || `${path}.ts` === runtimeModule)
          return { path: "./runtime.cjs", external: true };
      });
    },
  };
}

/**
 * whatwg-url 14.2's parser is JS, but its encoding leaf constructs host codecs.
 * Substitute only that leaf with the SDK's portable, standards-tested UTF-8
 * implementation when bundling. No consumer aliases or global patches are needed.
 * Keep the parser pinned and validate this substitution in the Hermes artifact test.
 */
export function portableUrlPlugin(encodingModule) {
  return {
    name: "idkit-portable-url-encoding",
    setup(build) {
      build.onResolve({ filter: /^\.\/encoding(?:\.js)?$/ }, (args) => {
        if (
          args.importer
            .replaceAll("\\", "/")
            .includes("/node_modules/whatwg-url/lib/")
        )
          return { path: encodingModule };
      });
    },
  };
}
