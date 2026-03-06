import Link from "next/link";
import type { ReactElement } from "react";
import { DemoClient } from "./ui";

export default function HomePage(): ReactElement {
  return (
    <main>
      <h1>IDKit Next.js Example</h1>
      <p>
        This example shows the widget request flow with the same legacy presets
        as the browser example.
      </p>
      <p>
        Need to test raw World ID 4.0 proof responses?{" "}
        <Link href="/verify-proof">Open the verify proof page</Link>.
      </p>
      <DemoClient />
    </main>
  );
}
