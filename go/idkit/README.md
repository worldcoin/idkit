# IDKit Go Server SDK

Go module for RP signature generation used by World ID server integrations.

## Install

```bash
go get github.com/worldcoin/idkit/go/idkit@latest
```

## API

- `NewSigner(signingKeyHex)` — creates a reusable signer (parses the key once)
- `SignRequest(signingKeyHex)` — one-shot sign with default TTL (300s)
- `SignRequestWithTTL(signingKeyHex, ttl)` — one-shot sign with custom TTL

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

	sig, err := signer.SignRequestWithTTL(300)
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
