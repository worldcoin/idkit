//! Optional numeric nullifier utility; existing `IDKit` response fields remain strings.

use std::str::FromStr;
use world_id_primitives::{FieldElement, Nullifier as ProtocolNullifier};

use crate::{Error, Result};

/// A checked nullifier. Parsing its format does not verify a proof.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
pub struct Nullifier {
    value: ProtocolNullifier,
}

impl Nullifier {
    /// Reads 1–64 hex digits with an optional `0x`/`0X` prefix.
    ///
    /// # Errors
    /// Returns an error for invalid hex or a value outside the World ID field.
    pub fn from_hex(hex: &str) -> Result<Self> {
        let digits = hex
            .strip_prefix("0x")
            .or_else(|| hex.strip_prefix("0X"))
            .unwrap_or(hex);
        if digits.is_empty() || digits.len() > 64 || !digits.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(Error::InvalidConfiguration(
                "Invalid nullifier hex string".to_owned(),
            ));
        }
        let padded = format!("{digits:0>64}");
        let field = FieldElement::from_str(&padded).map_err(|_| {
            Error::InvalidConfiguration("Nullifier is outside the World ID field".to_owned())
        })?;
        Ok(Self {
            value: ProtocolNullifier::new(field),
        })
    }

    /// Reads the protocol's strict `nil_` representation.
    ///
    /// # Errors
    /// Returns an error for noncanonical or out-of-field input.
    pub fn from_canonical_string(canonical_string: &str) -> Result<Self> {
        ProtocolNullifier::from_canonical_string(canonical_string.to_owned())
            .map(|value| Self { value })
            .map_err(|error| Error::InvalidConfiguration(error.to_string()))
    }

    /// Returns the protocol's `nil_` representation.
    #[must_use]
    pub fn to_canonical_string(&self) -> String {
        self.value.to_canonical_string()
    }

    /// Returns `0x` and exactly 64 lowercase hex digits.
    #[must_use]
    pub fn to_hex(&self) -> String {
        self.value.inner.to_string()
    }

    /// Returns the exact number in decimal, without leading zeroes.
    #[must_use]
    pub fn to_decimal_string(&self) -> String {
        self.value.as_number().to_string()
    }
}

#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
impl Nullifier {
    /// Creates a checked nullifier from hex.
    ///
    /// # Errors
    /// Returns an error for invalid or out-of-field input.
    #[uniffi::constructor(name = "from_hex")]
    pub fn ffi_from_hex(
        hex: String,
    ) -> std::result::Result<std::sync::Arc<Self>, crate::error::IdkitError> {
        Self::from_hex(&hex)
            .map(std::sync::Arc::new)
            .map_err(Into::into)
    }

    /// Creates a checked nullifier from the protocol's `nil_` representation.
    ///
    /// # Errors
    /// Returns an error for noncanonical or out-of-field input.
    #[uniffi::constructor(name = "from_canonical_string")]
    pub fn ffi_from_canonical_string(
        canonical_string: String,
    ) -> std::result::Result<std::sync::Arc<Self>, crate::error::IdkitError> {
        Self::from_canonical_string(&canonical_string)
            .map(std::sync::Arc::new)
            .map_err(Into::into)
    }

    /// Returns the protocol's `nil_` representation.
    #[must_use]
    #[uniffi::method(name = "to_canonical_string")]
    pub fn ffi_to_canonical_string(&self) -> String {
        self.to_canonical_string()
    }

    /// Returns the fixed-width hex value.
    #[must_use]
    #[uniffi::method(name = "to_hex")]
    pub fn ffi_to_hex(&self) -> String {
        self.to_hex()
    }

    /// Returns the exact decimal number.
    #[must_use]
    #[uniffi::method(name = "to_decimal_string")]
    pub fn ffi_to_decimal_string(&self) -> String {
        self.to_decimal_string()
    }
}

#[cfg(test)]
mod tests {
    use super::Nullifier;

    #[derive(serde::Deserialize)]
    struct Vectors {
        valid: Vec<Vector>,
        invalid: Vec<String>,
        invalid_canonical: Vec<String>,
    }

    #[derive(serde::Deserialize)]
    struct Vector {
        input: String,
        hex: String,
        decimal: String,
        canonical: String,
    }

    #[test]
    fn shared_nullifier_vectors() {
        let vectors: Vectors =
            serde_json::from_str(include_str!("../../../test-vectors/nullifier.json")).unwrap();
        for vector in vectors.valid {
            let value = Nullifier::from_hex(&vector.input).unwrap();
            assert_eq!(value.to_hex(), vector.hex);
            assert_eq!(value.to_canonical_string(), vector.canonical);
            let restored = Nullifier::from_canonical_string(&value.to_canonical_string()).unwrap();
            assert_eq!(restored.to_hex(), vector.hex);
            assert_eq!(restored.to_decimal_string(), vector.decimal);
            assert_eq!(value.to_decimal_string(), vector.decimal);
            assert_eq!(
                Nullifier::from_hex(&value.to_hex())
                    .unwrap()
                    .to_decimal_string(),
                vector.decimal
            );
        }
        for input in vectors.invalid_canonical {
            assert!(
                Nullifier::from_canonical_string(&input).is_err(),
                "accepted {input:?}"
            );
        }
        for input in vectors.invalid {
            assert!(Nullifier::from_hex(&input).is_err(), "accepted {input:?}");
        }
    }
}
