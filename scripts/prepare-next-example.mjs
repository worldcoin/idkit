import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { candidatePackages, root, runPnpm } from "./package-consumer.mjs";

const args = process.argv.slice(2);
if (args.length && (args[0] !== "--artifacts" || args.length !== 2))
  throw new Error(
    "Usage: pnpm prepare:next [--artifacts release-artifacts-directory]",
  );
const candidate = candidatePackages(args[1]);
const directory = join(root, "js/examples/nextjs");
const destination = join(directory, ".idkit-candidate");
mkdirSync(destination, { recursive: true });
for (const [id, entry] of Object.entries(candidate.manifest.packages))
  copyFileSync(
    join(candidate.directory, entry.filename),
    join(destination, `idkit-${id}.tgz`),
  );
// Updating the local tarball contents necessarily updates their lock integrity;
// the existing lock retains the isolated example's external dependency versions.
runPnpm(["install", "--no-frozen-lockfile", "--prefer-offline"], directory);
console.log(
  `Next.js now consumes packed SDKs: ${Object.values(
    candidate.manifest.packages,
  )
    .map((p) => `${p.name}@${p.version}`)
    .join(", ")}`,
);
console.log("Start with: corepack pnpm -C js/examples/nextjs dev");
