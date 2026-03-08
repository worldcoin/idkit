//! Issuer schema ID mapping for World ID 4.0 credentials.
//!
//! Maps between string credential identifiers (e.g., "proof_of_human", "face") and
//! their corresponding `u64` issuer schema IDs used in the protocol.

/// Maps credential identifier string to issuer schema ID.
///
/// # Arguments
/// * `identifier` - Credential type string (e.g., "proof_of_human", "face", "passport")
///
/// # Returns
/// * `Some(u64)` - The issuer schema ID for known credentials
/// * `None` - For unknown credential identifiers
#[must_use]
pub fn credential_to_issuer_schema_id(identifier: &str) -> Option<u64> {
    match identifier {
        "proof_of_human" => Some(1),
        "face" => Some(11),
        "passport" => Some(9303),
        "mnc" => Some(9310),
        _ => None,
    }
}

/// Maps issuer schema ID back to credential identifier.
///
/// # Arguments
/// * `id` - The `u64` issuer schema ID
///
/// # Returns
/// * `Some(&'static str)` - The credential identifier for known IDs
/// * `None` - For unknown issuer schema IDs
#[must_use]
pub fn issuer_schema_id_to_credential(id: u64) -> Option<&'static str> {
    match id {
        1 => Some("proof_of_human"),
        11 => Some("face"),
        9303 => Some("passport"),
        9310 => Some("mnc"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_to_issuer_schema_id() {
        assert_eq!(credential_to_issuer_schema_id("proof_of_human"), Some(1));
        assert_eq!(credential_to_issuer_schema_id("face"), Some(11));
        assert_eq!(credential_to_issuer_schema_id("passport"), Some(9303));
        assert_eq!(credential_to_issuer_schema_id("mnc"), Some(9310));
        assert_eq!(credential_to_issuer_schema_id("unknown"), None);
    }

    #[test]
    fn test_issuer_schema_id_to_credential() {
        assert_eq!(issuer_schema_id_to_credential(1), Some("proof_of_human"));
        assert_eq!(issuer_schema_id_to_credential(9310), Some("mnc"));
        assert_eq!(issuer_schema_id_to_credential(99), None);
    }

    #[test]
    fn test_roundtrip() {
        for cred in ["proof_of_human", "face", "passport", "mnc"] {
            let id = credential_to_issuer_schema_id(cred).unwrap();
            assert_eq!(issuer_schema_id_to_credential(id), Some(cred));
        }
    }
}
