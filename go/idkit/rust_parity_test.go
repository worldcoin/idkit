//go:build rust_parity

package idkit

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// rustSign calls the rp-sign-vectors Rust binary with deterministic inputs
// and returns the Rust-computed signature for cross-language parity comparison.
func rustSign(t *testing.T, keyHex, nonceHex string, createdAt, expiresAt uint64, action string) RpSignature {
	t.Helper()

	_, thisFile, _, _ := runtime.Caller(0)
	binPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "target", "release", "rp-sign-vectors")

	args := []string{
		keyHex,
		nonceHex,
		fmt.Sprintf("%d", createdAt),
		fmt.Sprintf("%d", expiresAt),
	}
	if action != "" {
		args = append(args, action)
	}

	cmd := exec.Command(binPath, args...)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			t.Fatalf("rp-sign-vectors failed: %s\nstderr: %s", err, exitErr.Stderr)
		}
		t.Fatalf("rp-sign-vectors failed: %s", err)
	}

	var sig RpSignature
	if err := json.Unmarshal(out, &sig); err != nil {
		t.Fatalf("failed to parse rp-sign-vectors output: %s\nraw: %s", err, out)
	}

	return sig
}

func TestSignRequestParityWithRust(t *testing.T) {
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

	goSig, err := signer.SignRequest()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rustSig := rustSign(t, testKey, goSig.Nonce, goSig.CreatedAt, goSig.ExpiresAt, "")

	if goSig.Sig != rustSig.Sig {
		t.Fatalf("signature mismatch:\n  go:   %s\n  rust: %s", goSig.Sig, rustSig.Sig)
	}
	if goSig.Nonce != rustSig.Nonce {
		t.Fatalf("nonce mismatch:\n  go:   %s\n  rust: %s", goSig.Nonce, rustSig.Nonce)
	}
}

func TestSignRequestParityWithRustMultipleVectors(t *testing.T) {
	t.Parallel()

	seeds := []struct {
		name  string
		fill  func([]byte)
		ttl   uint64
		nowFn func() uint64
	}{
		{
			name: "sequential",
			fill: func(dst []byte) {
				for i := range dst {
					dst[i] = byte(i)
				}
			},
			ttl:   300,
			nowFn: func() uint64 { return fixedUnixNow },
		},
		{
			name: "offset_10",
			fill: func(dst []byte) {
				for i := range dst {
					dst[i] = byte(i + 10)
				}
			},
			ttl:   600,
			nowFn: func() uint64 { return fixedUnixNow + 1000 },
		},
		{
			name: "all_0xff",
			fill: func(dst []byte) {
				for i := range dst {
					dst[i] = 0xff
				}
			},
			ttl:   60,
			nowFn: func() uint64 { return 1_800_000_000 },
		},
	}

	for _, s := range seeds {
		t.Run(s.name, func(t *testing.T) {
			t.Parallel()

			fill := s.fill
			signer := newTestSigner(t, testKey,
				s.nowFn,
				readerFunc(func(dst []byte) (int, error) {
					fill(dst)
					return len(dst), nil
				}),
			)

			goSig, err := signer.SignRequest(WithTTL(s.ttl))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			rustSig := rustSign(t, testKey, goSig.Nonce, goSig.CreatedAt, goSig.ExpiresAt, "")

			if goSig.Sig != rustSig.Sig {
				t.Fatalf("signature mismatch:\n  go:   %s\n  rust: %s", goSig.Sig, rustSig.Sig)
			}
		})
	}
}

func TestSignRequestParityWithRustAndAction(t *testing.T) {
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

	goSig, err := signer.SignRequest(WithAction("test-action"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rustSig := rustSign(t, testKey, goSig.Nonce, goSig.CreatedAt, goSig.ExpiresAt, "test-action")

	if goSig.Sig != rustSig.Sig {
		t.Fatalf("signature mismatch:\n  go:   %s\n  rust: %s", goSig.Sig, rustSig.Sig)
	}
	if goSig.Nonce != rustSig.Nonce {
		t.Fatalf("nonce mismatch:\n  go:   %s\n  rust: %s", goSig.Nonce, rustSig.Nonce)
	}
}
