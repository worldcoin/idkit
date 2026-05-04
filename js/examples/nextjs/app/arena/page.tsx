import type { ReactElement } from "react";
import { ArenaClient } from "./ui";

export default function ArenaPage(): ReactElement {
  return (
    <main>
      <a className="nav-link" href="/">
        Back to demo
      </a>
      <h1>IDKit Arena</h1>
      <p>
        Run World ID 3.0 preset, World ID 4.0 constraint, migration fallback,
        and error-path cases against a local World App build.
      </p>
      <ArenaClient />
    </main>
  );
}
