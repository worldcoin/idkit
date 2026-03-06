import Link from "next/link";
import type { ReactElement } from "react";
import { VerifyProofClient } from "./ui";

export default function VerifyProofPage(): ReactElement {
  return (
    <main>
      <h1>Verify 4.0 Proof Response</h1>
      <p>
        Paste a World ID 4.0 response JSON, map it to the Developer Portal
        payload, and verify it through <code>/api/verify-proof</code>.
      </p>
      <p>
        <Link href="/">Back to widget flow</Link>
      </p>
      <VerifyProofClient />
    </main>
  );
}
