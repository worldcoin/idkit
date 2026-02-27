package idkitserver

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	secp256k1 "github.com/decred/dcrd/dcrec/secp256k1/v4"
	secp256k1ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"golang.org/x/crypto/sha3"
)

const defaultTTLSeconds uint64 = 300

var (
	nowUnix    = func() uint64 { return uint64(time.Now().Unix()) }
	randomRead = rand.Read
)

// RpSignature contains all fields needed by the RP context verifier.
type RpSignature struct {
	Sig       string `json:"sig"`
	Nonce     string `json:"nonce"`
	CreatedAt uint64 `json:"createdAt"`
	ExpiresAt uint64 `json:"expiresAt"`
}

// hashToField computes keccak256(input) and shifts it right by 8 bits.
// This mirrors the JS and Rust behavior used for nonce derivation.
func hashToField(input []byte) []byte {
	hash := keccak256(input)

	field := make([]byte, 32)
	field[0] = 0
	copy(field[1:], hash[:31])

	return field
}

// computeRpSignatureMessage builds the 48-byte RP signature payload:
// nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8).
func computeRpSignatureMessage(
	nonceBytes []byte,
	createdAt uint64,
	expiresAt uint64,
) []byte {
	message := make([]byte, 48)
	copy(message[:32], nonceBytes)
	binary.BigEndian.PutUint64(message[32:40], createdAt)
	binary.BigEndian.PutUint64(message[40:48], expiresAt)

	return message
}

// SignRequest computes the RP signature payload with defaults compatible with JS:
// ttl defaults to 300 seconds if omitted.
func SignRequest(action string, signingKeyHex string, ttl ...uint64) (RpSignature, error) {
	if len(ttl) > 1 {
		return RpSignature{}, errors.New("ttl accepts at most one value")
	}

	ttlSec := defaultTTLSeconds
	if len(ttl) == 1 {
		ttlSec = ttl[0]
	}

	return signRequestWithDeps(action, signingKeyHex, ttlSec, nowUnix, randomRead)
}

func signRequestWithDeps(
	_action string,
	signingKeyHex string,
	ttl uint64,
	nowFn func() uint64,
	randomFn func([]byte) (int, error),
) (RpSignature, error) {
	privKey, err := parseSigningKey(signingKeyHex)
	if err != nil {
		return RpSignature{}, err
	}

	var randomBytes [32]byte
	n, err := randomFn(randomBytes[:])
	if err != nil {
		return RpSignature{}, fmt.Errorf("failed to generate random nonce: %w", err)
	}
	if n != len(randomBytes) {
		return RpSignature{}, fmt.Errorf(
			"failed to generate random nonce: expected %d bytes, got %d",
			len(randomBytes),
			n,
		)
	}

	nonceBytes := hashToField(randomBytes[:])

	createdAt := nowFn()
	expiresAt := createdAt + ttl

	message := computeRpSignatureMessage(nonceBytes, createdAt, expiresAt)
	msgHash := keccak256(message)
	compactSig := secp256k1ecdsa.SignCompact(privKey, msgHash, false)
	sig65 := make([]byte, 65)
	copy(sig65[:64], compactSig[1:])
	sig65[64] = compactSig[0]

	return RpSignature{
		Sig:       "0x" + hex.EncodeToString(sig65),
		Nonce:     "0x" + hex.EncodeToString(nonceBytes),
		CreatedAt: createdAt,
		ExpiresAt: expiresAt,
	}, nil
}

func parseSigningKey(signingKeyHex string) (*secp256k1.PrivateKey, error) {
	keyHex := strings.TrimPrefix(signingKeyHex, "0x")
	keyHex = strings.TrimPrefix(keyHex, "0X")

	if len(keyHex) != 64 {
		return nil, fmt.Errorf(
			"invalid signing key: expected 32 bytes (64 hex chars), got %d bytes",
			len(keyHex)/2,
		)
	}

	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, errors.New("invalid signing key: contains non-hex characters")
	}

	var scalar secp256k1.ModNScalar
	if overflow := scalar.SetByteSlice(keyBytes); overflow || scalar.IsZero() {
		return nil, errors.New("invalid signing key: out of range")
	}

	return secp256k1.NewPrivateKey(&scalar), nil
}

func keccak256(input []byte) []byte {
	hasher := sha3.NewLegacyKeccak256()
	_, _ = hasher.Write(input)
	return hasher.Sum(nil)
}
