# IDKit Go Server SDK

Go module for RP signature generation used by World ID server integrations.

## Install

```bash
go get github.com/worldcoin/idkit/go/idkit@latest
```

## API

- `NewSigner(signingKeyHex)` — creates a reusable signer (parses the key once)
- `SignRequest(signingKeyHex, opts...)` — one-shot sign with optional `WithAction(...)` and `WithTTL(...)`
- `SignRequestWithTTL(signingKeyHex, ttl)` — one-shot helper for custom TTL without an action
- `WithAction(action)` — adds the hashed action field to the signed payload
- `WithTTL(ttl)` — overrides the default TTL (300s)

## Example

```go
package main

import (
	"fmt"
	"log"

	"github.com/worldcoin/idkit/go/idkit"
)

func main() {
	signer, err := idkit.NewSigner("0xabababababababababababababababababababababababababababababababab")
	if err != nil {
		log.Fatal(err)
	}

	sig, err := signer.SignRequest(
		idkit.WithAction("my-action"),
		idkit.WithTTL(300),
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("sig:", sig.Sig)
	fmt.Println("nonce:", sig.Nonce)
	fmt.Println("created_at:", sig.CreatedAt)
	fmt.Println("expires_at:", sig.ExpiresAt)
}
```

## Release tags

This module lives in a subdirectory, so Go release tags must be:

`go/idkit/vX.Y.Z`
