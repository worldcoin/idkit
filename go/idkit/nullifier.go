package idkit

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
)

// Nullifier stores a checked World ID field element. Its zero value is numeric zero.
// Parsing a nullifier does not verify its proof.
type Nullifier struct {
	value [32]byte
}

// NullifierFromHex reads 1-64 hex digits, optionally prefixed with 0x or 0X.
// It rejects invalid and out-of-field values; it never reduces modulo the field.
func NullifierFromHex(value string) (Nullifier, error) {
	digits := value
	if strings.HasPrefix(digits, "0x") || strings.HasPrefix(digits, "0X") {
		digits = digits[2:]
	}
	if len(digits) == 0 || len(digits) > 64 {
		return Nullifier{}, errors.New("invalid nullifier hex string")
	}
	for _, c := range digits {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return Nullifier{}, errors.New("invalid nullifier hex string")
		}
	}
	number, ok := new(big.Int).SetString(digits, 16)
	// World ID uses the BabyJubJub base field (BN254 scalar field).
	// Modulus source: https://github.com/arkworks-rs/algebra/blob/df907e8c1601a898c2903ed7ab7bbbb10607f36b/curves/bn254/src/fields/fr.rs#L4
	modulus, _ := new(big.Int).SetString("21888242871839275222246405745257275088548364400416034343698204186575808495617", 10)
	if !ok || number.Cmp(modulus) >= 0 {
		return Nullifier{}, errors.New("nullifier is outside the World ID field")
	}
	var result Nullifier
	number.FillBytes(result.value[:])
	return result, nil
}

// BigInt returns a fresh copy of the number, safe for the caller to modify.
func (n Nullifier) BigInt() *big.Int {
	return new(big.Int).SetBytes(n.value[:])
}

// ToHex returns 0x followed by exactly 64 lowercase hex digits.
func (n Nullifier) ToHex() string {
	return "0x" + hex.EncodeToString(n.value[:])
}

// MarshalJSON encodes the nullifier as its fixed-width hex string.
func (n Nullifier) MarshalJSON() ([]byte, error) {
	return json.Marshal(n.ToHex())
}

// UnmarshalJSON checks a hex string and leaves the receiver unchanged on error.
func (n *Nullifier) UnmarshalJSON(data []byte) error {
	if n == nil {
		return errors.New("cannot unmarshal a nullifier into a nil receiver")
	}
	var input string
	if err := json.Unmarshal(data, &input); err != nil {
		return err
	}
	value, err := NullifierFromHex(input)
	if err != nil {
		return err
	}
	*n = value
	return nil
}
