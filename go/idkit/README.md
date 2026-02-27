# IDKit Go Server SDK

Go module for RP signature generation used by World ID server integrations.

## Install

```bash
go get github.com/worldcoin/idkit/go/idkit@latest
```

## API

- `SignRequest(signingKeyHex)` — signs with default TTL (300s)
- `SignRequestWithTTL(signingKeyHex, ttl)` — signs with custom TTL

## Example

```go
package main

import (
	"fmt"
	"log"

	idkit "github.com/worldcoin/idkit/go/idkit"
)

func main() {
	sig, err := idkit.SignRequest(
		"0xabababababababababababababababababababababababababababababababab",
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
