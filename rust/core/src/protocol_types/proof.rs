//! World ID Proof types for Protocol 4.0.
//!
//! Lightweight wrapper for ZK proofs that's JSON-compatible with `world-id-primitives`.

use serde::{de::Error as _, Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// A World ID Proof (Groth16 ZKP + Merkle root).
///
/// JSON format: 320-character hex string (160 bytes encoded).
///
/// The proof contains:
/// - A (G1 point): 32 bytes compressed
/// - B (G2 point): 64 bytes compressed
/// - C (G1 point): 32 bytes compressed
/// - Merkle root: 32 bytes
///
/// This is a passthrough type - we don't parse or validate the proof contents,
/// just preserve the hex encoding for JSON serialization.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WorldIdProof(String);

impl WorldIdProof {
    /// Expected length of the hex-encoded proof (160 bytes = 320 hex chars).
    pub const HEX_LENGTH: usize = 320;

    /// Creates a new `WorldIdProof` from a hex string.
    ///
    /// The hex string should be exactly 320 characters (160 bytes).
    #[must_use]
    pub fn new(hex: impl Into<String>) -> Self {
        Self(hex.into())
    }

    /// Returns the hex string representation.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Returns the raw bytes of the proof (decoded from hex).
    ///
    /// Returns `None` if the hex string is invalid.
    #[must_use]
    pub fn to_bytes(&self) -> Option<Vec<u8>> {
        hex::decode(&self.0).ok()
    }

    /// Creates a `WorldIdProof` from raw bytes.
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self(hex::encode(bytes))
    }

    /// Validates that the proof has the correct format.
    #[must_use]
    pub fn is_valid_format(&self) -> bool {
        self.0.len() == Self::HEX_LENGTH && hex::decode(&self.0).is_ok()
    }
}

impl fmt::Display for WorldIdProof {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Serialize for WorldIdProof {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for WorldIdProof {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        // Basic validation
        if s.chars().any(|c| !c.is_ascii_hexdigit()) {
            return Err(D::Error::custom("WorldIdProof must be a valid hex string"));
        }
        Ok(Self(s))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_roundtrip() {
        // Default proof from world-id-primitives (all zeros)
        let default_proof_hex = "00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000";

        let proof = WorldIdProof::new(default_proof_hex);
        assert_eq!(proof.as_str(), default_proof_hex);

        let json = serde_json::to_string(&proof).unwrap();
        assert_eq!(json, format!("\"{default_proof_hex}\""));

        let parsed: WorldIdProof = serde_json::from_str(&json).unwrap();
        assert_eq!(proof, parsed);
    }

    #[test]
    fn test_proof_validation() {
        let valid_proof = WorldIdProof::new("00".repeat(160));
        assert!(valid_proof.is_valid_format());

        let short_proof = WorldIdProof::new("00".repeat(100));
        assert!(!short_proof.is_valid_format());

        let invalid_hex = WorldIdProof::new("gg".repeat(160));
        assert!(!invalid_hex.is_valid_format());
    }
}
