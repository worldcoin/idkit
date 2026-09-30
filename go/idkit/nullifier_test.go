package idkit

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestNullifierVectors(t *testing.T) {
	data, err := os.ReadFile("../../test-vectors/nullifier.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors struct {
		Valid   []struct{ Input, Hex, Decimal string }
		Invalid []string
	}
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatal(err)
	}
	for _, v := range vectors.Valid {
		t.Run(v.Input, func(t *testing.T) {
			value, err := NullifierFromHex(v.Input)
			if err != nil {
				t.Fatal(err)
			}
			if value.ToHex() != v.Hex || value.BigInt().String() != v.Decimal {
				t.Fatalf("wrong value for %q", v.Input)
			}
			encoded, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			var restored Nullifier
			if err := json.Unmarshal(encoded, &restored); err != nil {
				t.Fatal(err)
			}
			if restored != value {
				t.Fatal("JSON round trip changed the value")
			}
			value.BigInt().SetInt64(42)
			if value.BigInt().String() != v.Decimal {
				t.Fatal("caller changed the stored number")
			}
		})
	}
	for _, input := range vectors.Invalid {
		if _, err := NullifierFromHex(input); err == nil {
			t.Errorf("accepted %q", input)
		}
	}
}

func TestNullifierJSONErrorPreservesValue(t *testing.T) {
	value, err := NullifierFromHex("0x1a")
	if err != nil {
		t.Fatal(err)
	}
	original := value
	// The last input is the field modulus, which must be rejected.
	// Source: https://github.com/arkworks-rs/algebra/blob/df907e8c1601a898c2903ed7ab7bbbb10607f36b/curves/bn254/src/fields/fr.rs#L4
	for _, input := range []string{`null`, `26`, `{}`, `"invalid"`, `"0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001"`} {
		if err := json.Unmarshal([]byte(input), &value); err == nil {
			t.Errorf("accepted %s", input)
		}
		if value != original {
			t.Fatal("invalid JSON changed the receiver")
		}
	}
	var zero Nullifier
	if zero.BigInt().Sign() != 0 || zero.ToHex() != "0x"+strings.Repeat("0", 64) {
		t.Fatal("invalid zero value")
	}
}
