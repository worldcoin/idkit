//! Lightweight primitive types for World ID Protocol 4.0.
//!
//! These types are JSON-compatible with the `world-id-primitives` crate but don't
//! require heavy crypto dependencies. They're designed for serialization/deserialization
//! only - no cryptographic operations are performed.

use serde::{de::Error as _, Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use std::str::FromStr;

/// A field element represented as a hex string.
///
/// JSON format: `"0x0000000000000000000000000000000000000000000000000000000000000001"`
///
/// This is a lightweight wrapper that's JSON-compatible with `world_id_primitives::FieldElement`
/// but doesn't require ark-ff or other heavy crypto dependencies.
///
/// ## Field Properties
///
/// The World ID Protocol uses the BabyJubJub curve. This type represents elements of the
/// base field (`Fq`), which is the scalar field of BN254. Valid field elements must be
/// less than the field modulus (~2^254).
///
/// **Note:** This pass-through type does not validate that values are within the field
/// modulus - it only validates the hex format. The authenticator/verifier will perform
/// full field validation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct FieldElement(String);

impl FieldElement {
    /// The additive identity (zero).
    pub const ZERO_STR: &'static str =
        "0x0000000000000000000000000000000000000000000000000000000000000000";

    /// The multiplicative identity (one).
    pub const ONE_STR: &'static str =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

    /// Creates a new FieldElement from a hex string.
    ///
    /// The string should be a 66-character hex string starting with "0x".
    #[must_use]
    pub fn new(hex: impl Into<String>) -> Self {
        Self(hex.into())
    }

    /// Creates a FieldElement from a u64 value.
    #[must_use]
    pub fn from_u64(value: u64) -> Self {
        Self(format!("0x{value:064x}"))
    }

    /// Returns the hex string representation.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Returns the zero element.
    #[must_use]
    pub fn zero() -> Self {
        Self(Self::ZERO_STR.to_string())
    }

    /// Returns the one element.
    #[must_use]
    pub fn one() -> Self {
        Self(Self::ONE_STR.to_string())
    }
}

impl fmt::Display for FieldElement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for FieldElement {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Must start with 0x prefix
        if !s.starts_with("0x") {
            return Err("FieldElement must start with '0x'".to_string());
        }
        let hex_part = &s[2..];
        // Must not exceed 64 hex characters (32 bytes)
        if hex_part.len() > 64 {
            return Err(format!(
                "FieldElement must be at most 64 hex characters, got {}",
                hex_part.len()
            ));
        }
        // Must be valid hex
        if hex_part.chars().any(|c| !c.is_ascii_hexdigit()) {
            return Err("FieldElement must be a valid hex string".to_string());
        }
        // Pad to 64 characters for consistent representation
        Ok(Self(format!("0x{hex_part:0>64}")))
    }
}

impl From<u64> for FieldElement {
    fn from(value: u64) -> Self {
        Self::from_u64(value)
    }
}

impl Serialize for FieldElement {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for FieldElement {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Self::from_str(&s).map_err(D::Error::custom)
    }
}

/// The ID of a relying party.
///
/// JSON format: `"rp_123456789abcdef0"`
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RpId(String);

impl RpId {
    /// Creates a new RpId from a u64 value.
    #[must_use]
    pub fn new(value: u64) -> Self {
        Self(format!("rp_{value:016x}"))
    }

    /// Creates a new RpId from a string (must start with "rp_").
    #[must_use]
    pub fn from_string(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    /// Returns the string representation.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RpId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for RpId {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if !s.starts_with("rp_") {
            return Err("RpId must start with 'rp_'".to_string());
        }
        Ok(Self(s.to_string()))
    }
}

impl Serialize for RpId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for RpId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Self::from_str(&s).map_err(D::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_element_from_u64() {
        let fe = FieldElement::from_u64(1);
        assert_eq!(
            fe.as_str(),
            "0x0000000000000000000000000000000000000000000000000000000000000001"
        );

        let fe = FieldElement::from_u64(255);
        assert_eq!(
            fe.as_str(),
            "0x00000000000000000000000000000000000000000000000000000000000000ff"
        );
    }

    #[test]
    fn test_field_element_json_roundtrip() {
        let fe = FieldElement::from_u64(42);
        let json = serde_json::to_string(&fe).unwrap();
        assert_eq!(
            json,
            "\"0x000000000000000000000000000000000000000000000000000000000000002a\""
        );

        let parsed: FieldElement = serde_json::from_str(&json).unwrap();
        assert_eq!(fe, parsed);
    }

    #[test]
    fn test_rp_id_format() {
        let rp_id = RpId::new(0x123456789abcdef0);
        assert_eq!(rp_id.as_str(), "rp_123456789abcdef0");

        let json = serde_json::to_string(&rp_id).unwrap();
        assert_eq!(json, "\"rp_123456789abcdef0\"");
    }

    #[test]
    fn test_rp_id_roundtrip() {
        let rp_id = RpId::new(1);
        let json = serde_json::to_string(&rp_id).unwrap();
        let parsed: RpId = serde_json::from_str(&json).unwrap();
        assert_eq!(rp_id, parsed);
    }

    #[test]
    fn test_field_element_validation() {
        // Valid: exactly 64 hex chars
        let valid = "0x0000000000000000000000000000000000000000000000000000000000000001";
        assert!(FieldElement::from_str(valid).is_ok());

        // Invalid: missing 0x prefix
        assert!(FieldElement::from_str("0000000000000000000000000000000000000000000000000000000000000001").is_err());

        // Valid: short input gets padded
        let short = FieldElement::from_str("0x1").unwrap();
        assert_eq!(
            short.as_str(),
            "0x0000000000000000000000000000000000000000000000000000000000000001"
        );

        // Invalid: too long (> 64 hex chars)
        assert!(FieldElement::from_str("0x00000000000000000000000000000000000000000000000000000000000000001").is_err());

        // Invalid: non-hex characters
        assert!(FieldElement::from_str("0x000000000000000000000000000000000000000000000000000000000000000g").is_err());
    }
}
