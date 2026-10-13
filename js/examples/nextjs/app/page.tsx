import type { ReactElement } from "react";
import { DemoClient } from "./ui";
import { WidgetPreview } from "./widget-preview";

export default function HomePage(): ReactElement {
  return (
    <main>
      <h1>IDKit Next.js Example</h1>
      <p>
        This example shows the widget request flow for legacy presets, World ID
        4.0 credential requests, and identity checks.
      </p>
      <p>
        <a className="nav-link" href="/arena">
          Open Arena
        </a>
      </p>
      <WidgetPreview />
      <DemoClient />
    </main>
  );
}
