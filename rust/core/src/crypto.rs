//! Cryptographic utilities for `IDKit`

use crate::Result;
use ruint::aliases::U256;
use tiny_keccak::{Hasher, Keccak};

// ============================================================================
// AES-256-GCM encryption (unified implementation for native and WASM)
// ============================================================================
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
use {
    aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    },
    getrandom::getrandom,
    hkdf::Hkdf,
    sha2::Sha256,
};

/// Generates a random encryption key and nonce for AES-256-GCM
///
/// Returns a tuple of (`key_bytes`, `nonce_bytes`) as fixed-size arrays
///
/// # Errors
///
/// Returns an error if the random number generator fails
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub fn generate_key() -> Result<([u8; 32], [u8; 12])> {
    use crate::Error;

    let mut key_bytes = [0u8; 32]; // 256 bits
    getrandom(&mut key_bytes).map_err(|e| Error::Crypto(format!("Failed to generate key: {e}")))?;

    let mut nonce_bytes = [0u8; 12]; // AES-GCM standard nonce length
    getrandom(&mut nonce_bytes)
        .map_err(|e| Error::Crypto(format!("Failed to generate nonce: {e}")))?;

    Ok((key_bytes, nonce_bytes))
}

/// Encrypts plaintext using AES-256-GCM
///
/// # Errors
///
/// Returns an error if encryption fails
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub fn encrypt(key: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    use crate::Error;

    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    // Convert slice to array and then to GenericArray
    let nonce_array: [u8; 12] = nonce
        .try_into()
        .map_err(|_| Error::Crypto("Nonce must be exactly 12 bytes".to_string()))?;
    let nonce_ref = Nonce::from(nonce_array);

    cipher
        .encrypt(&nonce_ref, plaintext)
        .map_err(|_| Error::Crypto("Encryption failed".to_string()))
}

/// Generates a random AES-GCM nonce (12 bytes).
///
/// Used by the invite-code path, which derives the AES key from the user-typed
/// code via HKDF and only needs a fresh nonce. The IV must NOT be derived from
/// the code — that would reuse the same (K, IV) pair across requests for the
/// same code, breaking AES-GCM's contract.
///
/// # Errors
///
/// Returns an error if the random number generator fails.
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub fn generate_nonce() -> Result<[u8; 12]> {
    use crate::Error;

    let mut nonce = [0u8; 12];
    getrandom(&mut nonce).map_err(|e| Error::Crypto(format!("Failed to generate nonce: {e}")))?;
    Ok(nonce)
}

/// Decrypts ciphertext using AES-256-GCM
///
/// # Errors
///
/// Returns an error if the nonce is invalid or decryption fails
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub fn decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    use crate::Error;

    if key.len() != 32 {
        return Err(Error::Crypto("Key must be 32 bytes".to_string()));
    }
    if nonce.len() != 12 {
        return Err(Error::Crypto("Nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| Error::Crypto("Invalid key length".to_string()))?;

    // Convert slice to array and then to GenericArray
    let nonce_array: [u8; 12] = nonce
        .try_into()
        .map_err(|_| Error::Crypto("Nonce must be exactly 12 bytes".to_string()))?;
    let nonce_ref = Nonce::from(nonce_array);

    cipher
        .decrypt(&nonce_ref, ciphertext)
        .map_err(|_| Error::Crypto("Decryption failed".to_string()))
}

// ============================================================================
// Invite-code primitives (WDP-73)
// ============================================================================
//
// The invite-code flow lets the RP show a short user-typeable code instead of
// a QR. Both idkit (RP) and World App must agree byte-for-byte on:
//   - The canonical code form (so HKDF inputs match).
//   - The HKDF parameters (so `index` and `key` derivations match).
//   - The lookup-key encoding (lowercase hex of `HKDF(C, "dx")`).
//
// Drift on any of these means the same code produces different bridge keys on
// each side and the redeem fails. Tests round-trip these helpers; the Swift
// port in world-app-ios must be kept in lockstep.

#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
mod invite_code {
    use super::{Hkdf, Sha256};

    /// Crockford Base32 alphabet — same set used for data digits and the check
    /// digit. Excludes I, L, O, U.
    const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    /// 5 random data chars + 1 check digit = 6 chars total.
    const DATA_LEN: usize = 5;
    const TOTAL_LEN: usize = 6;

    /// Position weights for the mod-32 check.
    ///
    /// All weights are odd (coprime to 32) so single-char substitutions always
    /// shift the check by a non-zero residue mod 32 — i.e. 100% of single-char
    /// substitutions are detected. Adjacent transpositions are caught when the
    /// transposed values differ by anything other than ±16 mod 32 (an
    /// unavoidable blind spot for any single mod-32 check digit).
    const WEIGHTS: [u32; DATA_LEN] = [1, 3, 5, 7, 9];

    /// Errors produced when parsing a user-typed invite code.
    #[derive(Debug, PartialEq, Eq)]
    #[allow(dead_code)] // pub(crate) helper; only consumed by tests today.
    pub enum InviteCodeError {
        WrongLength,
        InvalidChar,
        BadCheckDigit,
    }

    /// Generates a fresh canonical 6-char Crockford Base32 invite code.
    ///
    /// The check digit is the last character; the first 5 are uniformly random
    /// over the 32-char alphabet. UI may insert a separator between the two
    /// 3-char halves for display, but the canonical form has no separator.
    ///
    /// # Errors
    ///
    /// Returns an error if the random number generator fails. Mirrors the
    /// shape of `generate_nonce` so callers can propagate uniformly via `?`.
    pub fn generate_invite_code() -> crate::Result<String> {
        let mut rng_bytes = [0u8; DATA_LEN];
        getrandom::getrandom(&mut rng_bytes).map_err(|e| {
            crate::Error::Crypto(format!("Failed to generate invite code entropy: {e}"))
        })?;

        let mut values = [0u32; DATA_LEN];
        let mut code = String::with_capacity(TOTAL_LEN);
        for (i, byte) in rng_bytes.iter().enumerate() {
            // u8 % 32 is uniform over the alphabet (256 / 32 = 8, no bias).
            let v = u32::from(*byte) % 32;
            values[i] = v;
            code.push(CROCKFORD[v as usize] as char);
        }
        code.push(CROCKFORD[checksum(&values) as usize] as char);
        Ok(code)
    }

    /// Parses user input back to canonical form, validating the check digit.
    ///
    /// Strips ASCII whitespace and `-` / `_` separators, uppercases, and
    /// normalizes Crockford ambiguities (`I`/`L` → `1`, `O` → `0`). `U` is
    /// rejected as `InvalidChar` rather than mapped to `V` — `U`-as-`V` is a
    /// rare confusion and explicit rejection is clearer than silent rewrite.
    ///
    /// Returns the canonical 6-char string on success.
    #[allow(dead_code)] // pub(crate) helper; only consumed by tests today.
    pub fn parse_invite_code(input: &str) -> Result<String, InviteCodeError> {
        let mut canonical = String::with_capacity(TOTAL_LEN);
        for ch in input.chars() {
            if ch.is_ascii_whitespace() || ch == '-' || ch == '_' {
                continue;
            }
            let upper = ch.to_ascii_uppercase();
            let normalized = match upper {
                'I' | 'L' => '1',
                'O' => '0',
                _ => upper,
            };
            canonical.push(normalized);
        }
        if canonical.len() != TOTAL_LEN {
            return Err(InviteCodeError::WrongLength);
        }
        let bytes = canonical.as_bytes();
        let mut values = [0u32; DATA_LEN];
        for (i, value) in values.iter_mut().enumerate() {
            *value = decode_crockford(bytes[i]).ok_or(InviteCodeError::InvalidChar)?;
        }
        let expected = checksum(&values);
        let actual = decode_crockford(bytes[DATA_LEN]).ok_or(InviteCodeError::InvalidChar)?;
        if expected != actual {
            return Err(InviteCodeError::BadCheckDigit);
        }
        Ok(canonical)
    }

    fn checksum(values: &[u32; DATA_LEN]) -> u32 {
        let mut acc: u32 = 0;
        for (v, w) in values.iter().zip(WEIGHTS.iter()) {
            acc = acc.wrapping_add(v.wrapping_mul(*w));
        }
        acc % 32
    }

    fn decode_crockford(b: u8) -> Option<u32> {
        match b {
            b'0'..=b'9' => Some(u32::from(b - b'0')),
            b'A'..=b'H' => Some(u32::from(b - b'A') + 10),
            b'J' | b'K' => Some(u32::from(b - b'J') + 18),
            b'M' | b'N' => Some(u32::from(b - b'M') + 20),
            b'P'..=b'T' => Some(u32::from(b - b'P') + 22),
            b'V'..=b'Z' => Some(u32::from(b - b'V') + 27),
            _ => None,
        }
    }

    /// HKDF-SHA256, no salt, 32-byte output. RFC 5869.
    ///
    /// Both idkit and world-app-ios derive from the canonical code's UTF-8
    /// bytes; both implementations MUST match exactly or the same code yields
    /// different bridge keys per side.
    fn hkdf_invite(canonical_code: &str, info: &[u8]) -> [u8; 32] {
        let hk = Hkdf::<Sha256>::new(None, canonical_code.as_bytes());
        let mut out = [0u8; 32];
        hk.expand(info, &mut out)
            .expect("HKDF-SHA256 expand never fails for 32-byte output");
        out
    }

    /// `index` for the `code:idx:<index>` Redis key and the `POST /code/redeem`
    /// body — lowercase hex of `HKDF(C, "dx")`. world-app-ios sends hex on the
    /// wire and wallet-bridge stores the literal string as the key suffix; we
    /// match that exact format.
    pub fn hkdf_invite_index_hex(canonical_code: &str) -> String {
        use std::fmt::Write;
        let bytes = hkdf_invite(canonical_code, b"dx");
        let mut s = String::with_capacity(64);
        for b in bytes {
            let _ = write!(&mut s, "{b:02x}");
        }
        s
    }

    /// AES-256-GCM key for encrypting the request payload (and decrypting the
    /// World App response, which is encrypted with the same K).
    pub fn hkdf_invite_key(canonical_code: &str) -> [u8; 32] {
        hkdf_invite(canonical_code, b"key")
    }
}

#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
pub(crate) use invite_code::{generate_invite_code, hkdf_invite_index_hex, hkdf_invite_key};

// ============================================================================
// Common implementations (work on both native and WASM)
// ============================================================================

/// Cryptographic key wrapper for encryption/decryption
#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
#[derive(Debug, Clone)]
pub struct CryptoKey {
    /// AES-256 key (32 bytes)
    pub key: [u8; 32],
    /// Nonce for AES-GCM (12 bytes)
    pub nonce: [u8; 12],
}

#[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
impl CryptoKey {
    /// Creates a new crypto key from bytes
    #[must_use]
    pub const fn new(key: [u8; 32], nonce: [u8; 12]) -> Self {
        Self { key, nonce }
    }

    /// Generates a random crypto key
    ///
    /// # Errors
    ///
    /// Returns an error if random generation fails
    pub fn generate() -> Result<Self> {
        let (key, nonce) = generate_key()?;
        Ok(Self { key, nonce })
    }
}

/// Hashes a value to a field element using Keccak256
///
/// The output is shifted right by 8 bits to fit within the field prime
#[must_use]
pub fn hash_to_field(input: &[u8]) -> U256 {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(input);
    hasher.finalize(&mut output);

    // Convert to U256 and shift right by 8 bits (1 byte) to fit within the field prime
    let n =
        U256::try_from_be_slice(&output).unwrap_or_else(|| unreachable!("32 bytes fit in U256"));

    n >> 8
}

/// Hashes a signal using ABI encoding
///
/// Takes any type that implements `alloy_sol_types::SolValue` and returns the keccak256 hash
#[must_use]
pub fn hash_signal_abi<V: alloy_sol_types::SolValue>(signal: &V) -> U256 {
    hash_to_field(&signal.abi_encode_packed())
}

/// Hashes a signal using keccak256 hash
///
/// Takes a `Signal` (either string or bytes) and returns the keccak256 hash,
/// shifted right by 8 bits, formatted as a hex string with 0x prefix.
/// String signals intentionally use the same `0x` decoding semantics as the
/// JS `hashSignal` helper: valid non-empty even-length hex strings are hashed
/// as raw bytes, and all other strings are hashed as UTF-8 text.
#[must_use]
pub fn hash_signal(signal: &crate::Signal) -> String {
    let input = signal.hash_input_bytes();
    let hash = hash_to_field(input.as_ref());
    format!("{hash:#066x}")
}

/// Base64 encodes bytes
#[must_use]
pub fn base64_encode(input: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(input)
}

/// Base64 URL-safe encodes bytes (no padding)
#[must_use]
pub fn base64_url_encode(input: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    URL_SAFE_NO_PAD.encode(input)
}

// ============================================================================
// FFI exports for hashing utilities (Kotlin/Swift)
// ============================================================================

/// Hashes input bytes using Keccak256, shifted right 8 bits to fit within the field prime.
///
/// Returns raw bytes (32 bytes).
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // uniffi requires owned types
pub fn hash_to_field_ffi(input: Vec<u8>) -> Vec<u8> {
    hash_to_field(&input).to_be_bytes_vec()
}

/// Hashes a Signal to a signal hash (0x-prefixed hex string).
///
/// This is the same encoding used internally when constructing proof requests.
#[cfg(feature = "ffi")]
#[must_use]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // uniffi requires Arc for objects
pub fn hash_signal_ffi(signal: std::sync::Arc<crate::Signal>) -> String {
    hash_signal(&signal)
}

/// Base64 decodes a string
///
/// # Errors
///
/// Returns an error if the input is not valid base64
pub fn base64_decode(input: &str) -> Result<Vec<u8>> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(STANDARD.decode(input)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(feature = "native-crypto")]
    fn test_generate_key_native() {
        let (key_bytes, nonce_bytes) = generate_key().unwrap();
        assert_eq!(key_bytes.len(), 32);
        assert_eq!(nonce_bytes.len(), 12);
    }

    #[test]
    #[cfg(all(feature = "wasm-crypto", not(feature = "native-crypto")))]
    fn test_generate_key_wasm() {
        let (key, nonce) = generate_key().unwrap();
        assert_eq!(key.len(), 32);
        assert_eq!(nonce.len(), 12);
    }

    #[cfg(feature = "native-crypto")]
    #[test]
    fn test_encrypt_decrypt() {
        let (key_bytes, nonce_bytes) = generate_key().unwrap();
        let plaintext = b"Hello, World!";

        let ciphertext = encrypt(&key_bytes, &nonce_bytes, plaintext).unwrap();
        assert_ne!(ciphertext.as_slice(), plaintext);

        let decrypted = decrypt(&key_bytes, &nonce_bytes, &ciphertext).unwrap();
        assert_eq!(decrypted.as_slice(), plaintext);
    }

    #[test]
    fn test_hash_to_field() {
        let input = b"test";
        let hash = hash_to_field(input);
        // U256 is always 256 bits (32 bytes)
        // Verify it produces consistent output
        let hash2 = hash_to_field(input);
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_hash_signal() {
        use crate::Signal;

        // Test string signal
        let signal = Signal::from_string("test_signal");
        let hashed = hash_signal(&signal);
        assert!(hashed.starts_with("0x"));
        assert_eq!(hashed.len(), 66); // 0x + 64 hex chars

        // Test bytes signal
        let bytes_signal = Signal::from_bytes(vec![0x01, 0x02, 0x03]);
        let hashed_bytes = hash_signal(&bytes_signal);
        assert!(hashed_bytes.starts_with("0x"));
        assert_eq!(hashed_bytes.len(), 66);
    }

    #[test]
    fn test_hash_signal_decodes_prefixed_hex_strings() {
        use crate::Signal;

        let signal = "0x3df41d9d0ba00d8fbe5a9896bb01efc4b3787b7c";
        let address_bytes = hex::decode(signal.strip_prefix("0x").unwrap()).unwrap();
        let expected = hash_signal(&Signal::from_bytes(address_bytes));
        let utf8_hash = hash_signal(&Signal::from_bytes(signal.as_bytes()));

        assert_ne!(expected, utf8_hash);
        assert_eq!(hash_signal(&Signal::String(signal.to_string())), expected);
        assert_eq!(hash_signal(&Signal::from_string(signal)), expected);
    }

    #[test]
    fn test_base64_encode_decode() {
        let input = b"Hello, World!";
        let encoded = base64_encode(input);
        let decoded = base64_decode(&encoded).unwrap();
        assert_eq!(decoded.as_slice(), input);
    }

    #[cfg(any(feature = "native-crypto", feature = "wasm-crypto"))]
    mod invite_code_tests {
        use super::super::invite_code::{
            generate_invite_code, hkdf_invite_index_hex, hkdf_invite_key, parse_invite_code,
            InviteCodeError,
        };

        #[test]
        fn generate_produces_canonical_six_char_codes() {
            for _ in 0..200 {
                let code = generate_invite_code().unwrap();
                assert_eq!(code.len(), 6, "code must be exactly 6 chars");
                assert!(
                    code.chars()
                        .all(|c| "0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(c)),
                    "code must use only Crockford32 alphabet, got {code}"
                );
            }
        }

        #[test]
        fn generated_codes_round_trip_through_parser() {
            for _ in 0..200 {
                let code = generate_invite_code().unwrap();
                let parsed = parse_invite_code(&code).expect("freshly generated codes must parse");
                assert_eq!(parsed, code);
            }
        }

        #[test]
        fn parser_strips_separators_and_whitespace() {
            // First generate a real code so the check digit is correct.
            let code = generate_invite_code().unwrap();
            let formatted = format!("{}-{}", &code[..3], &code[3..]);
            assert_eq!(parse_invite_code(&formatted).unwrap(), code);

            let with_space = format!("{} {}", &code[..3], &code[3..]);
            assert_eq!(parse_invite_code(&with_space).unwrap(), code);

            let underscored = format!("{}_{}", &code[..3], &code[3..]);
            assert_eq!(parse_invite_code(&underscored).unwrap(), code);
        }

        #[test]
        fn parser_normalizes_lowercase_input() {
            let code = generate_invite_code().unwrap();
            let lower = code.to_lowercase();
            assert_eq!(parse_invite_code(&lower).unwrap(), code);
        }

        #[test]
        fn parser_normalizes_crockford_ambiguous_chars() {
            // Find a real code that contains a `1` so we can confirm the
            // I/L → 1 normalization round-trips. Generate until we find one.
            let code_with_one = (0..1000)
                .map(|_| generate_invite_code().unwrap())
                .find(|c| c.contains('1'))
                .expect("statistically certain to find a 1 in 1000 attempts");
            let with_i = code_with_one.replace('1', "I");
            assert_eq!(parse_invite_code(&with_i).unwrap(), code_with_one);
            let with_l = code_with_one.replace('1', "L");
            assert_eq!(parse_invite_code(&with_l).unwrap(), code_with_one);

            let code_with_zero = (0..1000)
                .map(|_| generate_invite_code().unwrap())
                .find(|c| c.contains('0'))
                .expect("statistically certain to find a 0 in 1000 attempts");
            let with_o = code_with_zero.replace('0', "O");
            assert_eq!(parse_invite_code(&with_o).unwrap(), code_with_zero);
        }

        #[test]
        fn parser_rejects_u_outright() {
            // Pick a code, replace one data char with U. U is not in the data
            // alphabet and we explicitly do NOT normalize U → V.
            let code = generate_invite_code().unwrap();
            let mut bytes = code.into_bytes();
            bytes[0] = b'U';
            let mangled = String::from_utf8(bytes).unwrap();
            assert_eq!(
                parse_invite_code(&mangled),
                Err(InviteCodeError::InvalidChar)
            );
        }

        #[test]
        fn parser_rejects_wrong_length() {
            assert_eq!(parse_invite_code("ABC"), Err(InviteCodeError::WrongLength));
            assert_eq!(
                parse_invite_code("ABCDEFG"),
                Err(InviteCodeError::WrongLength)
            );
            assert_eq!(parse_invite_code(""), Err(InviteCodeError::WrongLength));
        }

        #[test]
        fn parser_rejects_bad_check_digit() {
            let code = generate_invite_code().unwrap();
            // Flip the check digit to something else in the alphabet.
            let mut bytes = code.into_bytes();
            let last = bytes[5];
            bytes[5] = if last == b'0' { b'1' } else { b'0' };
            let mangled = String::from_utf8(bytes).unwrap();
            assert_eq!(
                parse_invite_code(&mangled),
                Err(InviteCodeError::BadCheckDigit)
            );
        }

        #[test]
        fn parser_catches_single_char_substitutions() {
            // The check digit's primary job. Try every possible single-char
            // substitution at every data position; all should reject.
            let code = generate_invite_code().unwrap();
            let alphabet = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
            for pos in 0..5 {
                let original = code.as_bytes()[pos];
                for &candidate in alphabet {
                    if candidate == original {
                        continue;
                    }
                    let mut bytes = code.as_bytes().to_vec();
                    bytes[pos] = candidate;
                    let mangled = String::from_utf8(bytes).unwrap();
                    assert_eq!(
                        parse_invite_code(&mangled),
                        Err(InviteCodeError::BadCheckDigit),
                        "single substitution at pos {pos} ({} -> {}) was not detected",
                        original as char,
                        candidate as char
                    );
                }
            }
        }

        #[test]
        fn hkdf_helpers_are_deterministic() {
            let code = "ABCDEF";
            assert_eq!(hkdf_invite_index_hex(code), hkdf_invite_index_hex(code));
            assert_eq!(hkdf_invite_key(code), hkdf_invite_key(code));
        }

        #[test]
        fn hkdf_index_is_64_lowercase_hex_chars() {
            // Matches world-app-ios's wire format. Bridge accepts the literal
            // string as the Redis key suffix, so the encoding must agree.
            let code = "ABCDEF";
            let index = hkdf_invite_index_hex(code);
            assert_eq!(index.len(), 64);
            assert!(
                index
                    .chars()
                    .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)),
                "index must be lowercase hex, got {index}"
            );
        }

        #[test]
        fn hkdf_index_and_key_differ_for_same_code() {
            // Different `info` strings → different outputs.
            let code = "ABCDEF";
            let index_bytes = hex::decode(hkdf_invite_index_hex(code)).unwrap();
            let key = hkdf_invite_key(code);
            assert_ne!(index_bytes.as_slice(), &key[..]);
        }

        #[test]
        fn hkdf_outputs_differ_across_codes() {
            assert_ne!(
                hkdf_invite_index_hex("ABCDEF"),
                hkdf_invite_index_hex("GHJKMN")
            );
            assert_ne!(hkdf_invite_key("ABCDEF"), hkdf_invite_key("GHJKMN"));
        }
    }

    // Known value that was used in previous idkit versions to verify consistency of the hash_to_field implementation
    #[test]
    fn test_hash_to_field_empty_string() {
        let hash = hash_to_field(b"");
        let hex = format!("{hash:#066x}");
        assert_eq!(
            hex,
            "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4"
        );
    }
}
