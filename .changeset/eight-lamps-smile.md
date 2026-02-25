---
"@worldcoin/idkit": major
---

Add optional widget `handleVerify` callback to gate success until host verification completes.

Make widget `onSuccess` required (types + runtime validation) and preserve immediate callback timing.

Map `failed_by_host_app` to generic error copy and show a dedicated host-verification loading state.
