import type { ReactElement } from "react";
import { TestCasesClient } from "./ui";

export default function ErrorCasesPage(): ReactElement {
  return (
    <main>
      <a className="nav-link" href="/">
        Back to demo
      </a>
      <h1>IDKit E2E Error Cases</h1>
      <p>
        Run malformed World ID 4.0 requests against a local World App build and
        compare the returned IDKit error code with the expected result.
      </p>
      <TestCasesClient />
    </main>
  );
}
