# IDKit Go Server SDK

Go module for RP signature generation used by World ID server integrations.

## Install

```bash
go get github.com/worldcoin/idkit/go/idkit-server@latest
```

## API

- `SignRequest(action, signingKeyHex, ttl...)`

## Example

```go
package main

import (
	"fmt"
	"log"

	idkitserver "github.com/worldcoin/idkit/go/idkit-server"
)

func main() {
	sig, err := idkitserver.SignRequest(
		"login",
		"0xabababababababababababababababababababababababababababababababab",
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("sig:", sig.Sig)
	fmt.Println("nonce:", sig.Nonce)
	fmt.Println("createdAt:", sig.CreatedAt)
	fmt.Println("expiresAt:", sig.ExpiresAt)
}
```

## Release tags

This module lives in a subdirectory, so Go release tags must be:

`go/idkit-server/vX.Y.Z`
