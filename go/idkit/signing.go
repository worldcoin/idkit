package idkit

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	secp256k1 "github.com/decred/dcrd/dcrec/secp256k1/v4"
	secp256k1ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"golang.org/x/crypto/sha3"
)

const defaultTTLSeconds uint64 = 300
const rpSignatureMsgVersion byte = 0x01
const ethereumMessagePrefix = "\x19Ethereum Signed Message:\n"

type signConfig struct {
	action string
	ttl    uint64
}

// SignOption configures RP signing behavior.
type SignOption func(*signConfig)

// WithAction appends the hashed action field to the signed payload.
func WithAction(action string) SignOption {
	return func(cfg *signConfig) {
		cfg.action = action
	}
}

// WithTTL overrides the default request TTL in seconds.
func WithTTL(ttl uint64) SignOption {
	return func(cfg *signConfig) {
		cfg.ttl = ttl
	}
}

func resolveSignConfig(opts []SignOption) signConfig {
	cfg := signConfig{ttl: defaultTTLSeconds}
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}

	return cfg
}

// Signer produces RP signatures for World ID verification requests.
type Signer struct {
	privKey *secp256k1.PrivateKey
	now     func() uint64
	random  io.Reader
}

// NewSigner returns a Signer wired to the system clock and crypto/rand.
func NewSigner(signingKeyHex string) (*Signer, error) {
	privKey, err := parseSigningKey(signingKeyHex)
	if err != nil {
		return nil, err
	}

	return &Signer{
		privKey: privKey,
		now:     func() uint64 { return uint64(time.Now().Unix()) },
		random:  rand.Reader,
	}, nil
}

// RpSignature contains all fields needed by the RP context verifier.
type RpSignature struct {
	Sig       string `json:"sig"`
	Nonce     string `json:"nonce"`
	CreatedAt uint64 `json:"created_at"`
	ExpiresAt uint64 `json:"expires_at"`
}

// hashToField computes keccak256(input) and shifts it right by 8 bits.
// This mirrors the JS and Rust behavior used for nonce derivation.
func hashToField(input []byte) []byte {
	hash := keccak256(input)

	field := make([]byte, 32)
	copy(field[1:], hash[:31])

	return field
}

// computeRpSignatureMessage builds the RP signature payload:
// version(1) || nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8) || action?(32).
func computeRpSignatureMessage(
	nonceBytes []byte,
	createdAt uint64,
	expiresAt uint64,
	action string,
) []byte {
	actionBytes := []byte(nil)
	if action != "" {
		actionBytes = hashToField([]byte(action))
	}

	message := make([]byte, 49+len(actionBytes))
	message[0] = rpSignatureMsgVersion
	copy(message[1:33], nonceBytes)
	binary.BigEndian.PutUint64(message[33:41], createdAt)
	binary.BigEndian.PutUint64(message[41:49], expiresAt)
	copy(message[49:], actionBytes)

	return message
}

// SignRequest computes the RP signature payload using optional signing options.
// By default it signs a session-style payload with a 300-second TTL using
// Ethereum EIP-191 message signing semantics.
func SignRequest(signingKeyHex string, opts ...SignOption) (RpSignature, error) {
	s, err := NewSigner(signingKeyHex)
	if err != nil {
		return RpSignature{}, err
	}

	return s.SignRequest(opts...)
}

// SignRequestWithTTL computes the RP signature payload with a custom TTL.
func SignRequestWithTTL(signingKeyHex string, ttl uint64) (RpSignature, error) {
	return SignRequest(signingKeyHex, WithTTL(ttl))
}

// SignRequest computes the RP signature payload using optional signing options.
func (s *Signer) SignRequest(opts ...SignOption) (RpSignature, error) {
	cfg := resolveSignConfig(opts)
	var randomBytes [32]byte

	if _, err := io.ReadFull(s.random, randomBytes[:]); err != nil {
		return RpSignature{}, fmt.Errorf("failed to generate random nonce: %w", err)
	}

	nonceBytes := hashToField(randomBytes[:])

	createdAt := s.now()
	expiresAt := createdAt + cfg.ttl

	message := computeRpSignatureMessage(nonceBytes, createdAt, expiresAt, cfg.action)
	msgHash := hashEthereumMessage(message)
	compactSig := secp256k1ecdsa.SignCompact(s.privKey, msgHash, false)
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

// SignRequestWithTTL computes the RP signature payload with a custom TTL.
func (s *Signer) SignRequestWithTTL(ttl uint64) (RpSignature, error) {
	return s.SignRequest(WithTTL(ttl))
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

func hashEthereumMessage(message []byte) []byte {
	prefix := make([]byte, 0, len(ethereumMessagePrefix)+20)
	prefix = append(prefix, ethereumMessagePrefix...)
	prefix = strconv.AppendInt(prefix, int64(len(message)), 10)

	payload := make([]byte, 0, len(prefix)+len(message))
	payload = append(payload, prefix...)
	payload = append(payload, message...)

	return keccak256(payload)
}
