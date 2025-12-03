# @worldcoin/idkit-react (light)

A lightweight React wrapper around `@worldcoin/idkit` that supports the `requests`-based configuration (multiple credential types/constraints). It renders a minimal modal and exposes an `open` render prop.

```tsx
import { IDKitWidget } from '@worldcoin/idkit-react'
import type { CredentialType } from '@worldcoin/idkit'

const requests = [
  { credential_type: 'face' as CredentialType, face_auth: true, signal: 'user_123' },
  { credential_type: 'orb' as CredentialType, signal: 'user_123' },
]

export function VerifyButton() {
  return (
    <IDKitWidget
      app_id="app_staging_123"
      action="login"
      requests={requests}
      constraints={{ any: [['face'], ['orb']] }}
      onSuccess={result => console.log(result)}
      handleVerify={async result => {
        // optional host-side checks; throw to show an error
      }}
    >
      {({ open }) => <button onClick={open}>Verify with World ID</button>}
    </IDKitWidget>
  )
}
```

Notes:
- If you provide `requests`, `verification_level` is ignored by the core bridge.
- The modal uses a hosted QR code image for convenience; you can set `show_modal={false}` and use the `connectorURI` from `useWorldBridgeStore` for a custom UI.
