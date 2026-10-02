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
