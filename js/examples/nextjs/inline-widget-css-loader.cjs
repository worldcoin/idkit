const { createRequire } = require("node:module");
const path = require("node:path");
const sdkRequire = createRequire(
  path.resolve(__dirname, "../../packages/react/package.json"),
);
const postcss = sdkRequire("postcss");
const postcssImport = sdkRequire("postcss-import");

// Compile the SDK's real Shadow DOM stylesheet for the example's source preview.
module.exports = function (source) {
  const done = this.async();
  postcss([postcssImport()])
    .process(source, { from: this.resourcePath })
    .then((result) => {
      for (const message of result.messages) {
        if (message.type === "dependency") this.addDependency(message.file);
      }
      done(null, `export default ${JSON.stringify(result.css)};`);
    })
    .catch(done);
};
