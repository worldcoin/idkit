package idkit

import (
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"testing"
)

const (
	testKeyNoPrefix = "abababababababababababababababababababababababababababababababab"
	testKey         = "0x" + testKeyNoPrefix
	fixedUnixNow    = uint64(1_700_000_000)
)

// readerFunc adapts a function into an io.Reader for test fakes.
type readerFunc func([]byte) (int, error)

func (f readerFunc) Read(p []byte) (int, error) { return f(p) }

func newTestSigner(t *testing.T, key string, nowFn func() uint64, r io.Reader) *Signer {
	t.Helper()

	s, err := NewSigner(key)
	if err != nil {
		t.Fatalf("failed to create test signer: %v", err)
	}

	s.now = nowFn
	s.random = r

	return s
}

func TestHashToFieldParityVectors(t *testing.T) {
	t.Parallel()

	vectors := []struct {
		name     string
		input    []byte
		expected string
	}{
		{
			name:     "empty",
			input:    []byte{},
			expected: "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
		},
		{
			name:     "test_signal",
			input:    []byte("test_signal"),
			expected: "0x00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed",
		},
		{
			name:     "raw bytes",
			input:    []byte{0x01, 0x02, 0x03},
			expected: "0x00f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92",
		},
		{
			name:     "hex decoded hello",
			input:    mustDecodeHex(t, "68656c6c6f"),
			expected: "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea",
		},
	}

	for _, vector := range vectors {
		t.Run(vector.name, func(t *testing.T) {
			t.Parallel()
			got := "0x" + hex.EncodeToString(hashToField(vector.input))
			if got != vector.expected {
				t.Fatalf("hash mismatch: got %s want %s", got, vector.expected)
			}
		})
	}
}

func TestComputeRpSignatureMessageVector(t *testing.T) {
	t.Parallel()

	nonce := mustDecodeHex(t, "008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd")
	message := computeRpSignatureMessage(nonce, fixedUnixNow, fixedUnixNow+300, "")

	expected := "01008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd000000006553f100000000006553f22c"
	got := hex.EncodeToString(message)
	if got != expected {
		t.Fatalf("message mismatch: got %s want %s", got, expected)
	}
}

func TestComputeRpSignatureMessageWithAction(t *testing.T) {
	t.Parallel()

	nonce := mustDecodeHex(t, "008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd")
	message := computeRpSignatureMessage(nonce, fixedUnixNow, fixedUnixNow+300, "test-action")

	if len(message) != 81 {
		t.Fatalf("expected message length 81, got %d", len(message))
	}

	expectedAction := hashToField([]byte("test-action"))
	gotAction := message[49:]
	if hex.EncodeToString(gotAction) != hex.EncodeToString(expectedAction) {
		t.Fatalf("action mismatch: got %x want %x", gotAction, expectedAction)
	}
}

func TestSignRequestDeterministicParityVector(t *testing.T) {
	t.Parallel()

	signer := newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(dst []byte) (int, error) {
			for i := range dst {
				dst[i] = byte(i)
			}
			return len(dst), nil
		}),
	)

	sig, err := signer.SignRequest()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sig.Nonce != "0x008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd" {
		t.Fatalf("nonce mismatch: got %s", sig.Nonce)
	}
	if sig.Sig != "0x37819a5e3213349572834237f3cb478659e6439dc97369c4b64734004d6ba4623450113c50f1e8b8a72662f5f6c71f8ef09ddd411a86c07efc6dd5ad692d75681b" {
		t.Fatalf("signature mismatch: got %s", sig.Sig)
	}
	if sig.CreatedAt != fixedUnixNow {
		t.Fatalf("createdAt mismatch: got %d want %d", sig.CreatedAt, fixedUnixNow)
	}
	if sig.ExpiresAt != fixedUnixNow+300 {
		t.Fatalf("expiresAt mismatch: got %d want %d", sig.ExpiresAt, fixedUnixNow+300)
	}
}

func TestSignRequestDeterministicParityVectorWithAction(t *testing.T) {
	t.Parallel()

	signer := newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(dst []byte) (int, error) {
			for i := range dst {
				dst[i] = byte(i)
			}
			return len(dst), nil
		}),
	)

	sig, err := signer.SignRequest(WithAction("test-action"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sig.Nonce != "0x008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd" {
		t.Fatalf("nonce mismatch: got %s", sig.Nonce)
	}
	if sig.Sig != "0xdf5fa73d98377548d1a4dd53dccb26c3c9405ee5d935cfe8bcfccbbceaa665a5240a0f57562f265b9b75c28cd4297cd2b78ca951fb842dfd02df126ab2cb214c1b" {
		t.Fatalf("signature mismatch: got %s", sig.Sig)
	}
	if sig.CreatedAt != fixedUnixNow {
		t.Fatalf("createdAt mismatch: got %d want %d", sig.CreatedAt, fixedUnixNow)
	}
	if sig.ExpiresAt != fixedUnixNow+300 {
		t.Fatalf("expiresAt mismatch: got %d want %d", sig.ExpiresAt, fixedUnixNow+300)
	}
}

func TestComputeRpSignatureMessageVersionByte(t *testing.T) {
	t.Parallel()

	nonce := make([]byte, 32)
	nonce[0] = 0x00
	nonce[1] = 0x42
	message := computeRpSignatureMessage(nonce, 1000, 1300, "")

	if len(message) != 49 {
		t.Fatalf("expected message length 49, got %d", len(message))
	}
	if message[0] != 0x01 {
		t.Fatalf("expected version byte 0x01, got 0x%02x", message[0])
	}
}

func TestSignRequestDefaultTTL(t *testing.T) {
	t.Parallel()

	signer := newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(dst []byte) (int, error) {
			for i := range dst {
				dst[i] = byte(i + 10)
			}
			return len(dst), nil
		}),
	)

	sig, err := signer.SignRequest()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sig.ExpiresAt-sig.CreatedAt != 300 {
		t.Fatalf("ttl mismatch: got %d want 300", sig.ExpiresAt-sig.CreatedAt)
	}
}

func TestSignRequestCustomTTL(t *testing.T) {
	t.Parallel()

	signer := newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(dst []byte) (int, error) {
			for i := range dst {
				dst[i] = byte(i + 20)
			}
			return len(dst), nil
		}),
	)

	sig, err := signer.SignRequest(WithTTL(600))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sig.ExpiresAt-sig.CreatedAt != 600 {
		t.Fatalf("ttl mismatch: got %d want 600", sig.ExpiresAt-sig.CreatedAt)
	}
}

func TestSignRequestFormatting(t *testing.T) {
	t.Parallel()

	sig, err := SignRequest(testKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.HasPrefix(sig.Sig, "0x") || len(sig.Sig) != 132 {
		t.Fatalf("invalid sig format: %s", sig.Sig)
	}
	if !strings.HasPrefix(sig.Nonce, "0x") || len(sig.Nonce) != 66 {
		t.Fatalf("invalid nonce format: %s", sig.Nonce)
	}
	if _, err := hex.DecodeString(sig.Sig[2:]); err != nil {
		t.Fatalf("invalid sig hex: %v", err)
	}
	if _, err := hex.DecodeString(sig.Nonce[2:]); err != nil {
		t.Fatalf("invalid nonce hex: %v", err)
	}
}

func TestSignRequestWithActionChangesSignature(t *testing.T) {
	t.Parallel()

	signer := newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(dst []byte) (int, error) {
			for i := range dst {
				dst[i] = byte(i)
			}
			return len(dst), nil
		}),
	)

	sessionSig, err := signer.SignRequest()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	signer = newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(dst []byte) (int, error) {
			for i := range dst {
				dst[i] = byte(i)
			}
			return len(dst), nil
		}),
	)

	actionSig, err := signer.SignRequest(WithAction("test-action"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sessionSig.Nonce != actionSig.Nonce {
		t.Fatalf("expected same nonce, got %s vs %s", sessionSig.Nonce, actionSig.Nonce)
	}
	if sessionSig.Sig == actionSig.Sig {
		t.Fatalf("expected action to change signature, got %s", actionSig.Sig)
	}
}

func TestSignRequestUniqueNonces(t *testing.T) {
	t.Parallel()

	sig1, err := SignRequest(testKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	sig2, err := SignRequest(testKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sig1.Nonce == sig2.Nonce {
		t.Fatalf("expected different nonces, got %s", sig1.Nonce)
	}
}

func TestSignRequestVIs27Or28(t *testing.T) {
	t.Parallel()

	sig, err := SignRequest(testKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	sigBytes := mustDecodeHex(t, strings.TrimPrefix(sig.Sig, "0x"))
	v := sigBytes[64]
	if v != 27 && v != 28 {
		t.Fatalf("invalid v value: %d", v)
	}
}

func TestSignRequestNonceHasLeadingZeroByte(t *testing.T) {
	t.Parallel()

	sig, err := SignRequest(testKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sig.Nonce[2:4] != "00" {
		t.Fatalf("nonce does not start with 00: %s", sig.Nonce)
	}
}

func TestSignRequestAcceptsKeyWithoutPrefix(t *testing.T) {
	t.Parallel()

	sig, err := SignRequest(testKeyNoPrefix)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sig.Sig) != 132 {
		t.Fatalf("invalid signature length: %d", len(sig.Sig))
	}
}

func TestSignRequestRejectsShortKey(t *testing.T) {
	t.Parallel()

	_, err := SignRequest("0xabcd")
	if err == nil {
		t.Fatal("expected error for short key")
	}
	if !strings.Contains(err.Error(), "expected 32 bytes") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSignRequestRejectsInvalidHex(t *testing.T) {
	t.Parallel()

	_, err := SignRequest(
		"0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
	)
	if err == nil {
		t.Fatal("expected error for invalid hex")
	}
	if !strings.Contains(err.Error(), "contains non-hex characters") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSignRequestFailsWhenRandomReadFails(t *testing.T) {
	t.Parallel()

	randomErr := errors.New("entropy unavailable")
	signer := newTestSigner(t, testKey,
		func() uint64 { return fixedUnixNow },
		readerFunc(func(_ []byte) (int, error) { return 0, randomErr }),
	)

	_, err := signer.SignRequest()
	if err == nil {
		t.Fatal("expected random failure")
	}
	if !strings.Contains(err.Error(), randomErr.Error()) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func mustDecodeHex(t *testing.T, input string) []byte {
	t.Helper()

	decoded, err := hex.DecodeString(input)
	if err != nil {
		t.Fatalf("failed to decode hex %q: %v", input, err)
	}
	return decoded
}
