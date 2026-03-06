//! Issuer schema ID mapping for World ID 4.0 credentials.
//!
//! Maps between string credential identifiers (e.g., "orb", "face") and
//! their corresponding `u64` issuer schema IDs used in the protocol.

/// Maps credential identifier string to issuer schema ID.
///
/// # Arguments
/// * `identifier` - Credential type string (e.g., "orb", "face", "device")
///
/// # Returns
/// * `Some(u64)` - The issuer schema ID for known credentials
/// * `None` - For unknown credential identifiers
#[must_use]
pub fn credential_to_issuer_schema_id(identifier: &str) -> Option<u64> {
    match identifier {
        "orb" => Some(1),
        "face" => Some(2),
        "secure_document" => Some(3),
        "document" => Some(4),
        "device" => Some(5),
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
        1 => Some("orb"),
        2 => Some("face"),
        3 => Some("secure_document"),
        4 => Some("document"),
        5 => Some("device"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_to_issuer_schema_id() {
        assert_eq!(credential_to_issuer_schema_id("orb"), Some(1));
        assert_eq!(credential_to_issuer_schema_id("face"), Some(2));
        assert_eq!(credential_to_issuer_schema_id("secure_document"), Some(3));
        assert_eq!(credential_to_issuer_schema_id("document"), Some(4));
        assert_eq!(credential_to_issuer_schema_id("device"), Some(5));
        assert_eq!(credential_to_issuer_schema_id("unknown"), None);
    }

    #[test]
    fn test_issuer_schema_id_to_credential() {
        assert_eq!(issuer_schema_id_to_credential(1), Some("orb"));
        assert_eq!(issuer_schema_id_to_credential(5), Some("device"));
        assert_eq!(issuer_schema_id_to_credential(99), None);
    }

    #[test]
    fn test_roundtrip() {
        for cred in ["orb", "face", "secure_document", "document", "device"] {
            let id = credential_to_issuer_schema_id(cred).unwrap();
            assert_eq!(issuer_schema_id_to_credential(id), Some(cred));
        }
    }
}
