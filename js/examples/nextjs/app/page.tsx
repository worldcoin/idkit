import type { ReactElement } from "react";
import { DemoClient } from "./ui";

export default function HomePage(): ReactElement {
  return (
    <main>
      <h1>IDKit Next.js Example</h1>
      <p>
        This example shows the widget request flow with the same three legacy
        presets as the browser example.
      </p>
      <DemoClient />
    </main>
  );
}
