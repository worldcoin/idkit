import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { candidatePackages, root } from "./package-consumer.mjs";

const [directory, target, sourceSha] = process.argv.slice(2);
if (!directory || !target || !sourceSha)
  throw new Error(
    "Usage: node scripts/use-package-artifacts.mjs artifact-directory target source-sha",
  );
const candidate = candidatePackages(directory, { target, sourceSha });
for (const [id, entry] of Object.entries(candidate.manifest.packages)) {
  // Load the exact prepared build for tests that import a workspace dist entry;
  // source-based differential tests still use the matching checked-out SHA.
  rmSync(join(root, "js/packages", id, "dist"), {
    recursive: true,
    force: true,
  });
  execFileSync("tar", [
    "-xzf",
    join(candidate.directory, entry.filename),
    "--strip-components=1",
    "-C",
    join(root, "js/packages", id),
    "package/dist",
  ]);
}
console.log(
  `Loaded verified release builds from ${candidate.manifest.source_sha}`,
);
