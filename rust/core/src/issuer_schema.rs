//! Issuer schema ID mapping for World ID 4.0 credentials.
//!
//! Maps between string credential identifiers (e.g., "orb", "face") and
//! their corresponding `FieldElement` issuer schema IDs used in the protocol.

use world_id_primitives::FieldElement;

/// Maps credential identifier string to issuer schema ID.
///
/// # Arguments
/// * `identifier` - Credential type string (e.g., "orb", "face", "device")
///
/// # Returns
/// * `Some(FieldElement)` - The issuer schema ID for known credentials
/// * `None` - For unknown credential identifiers
#[must_use]
pub fn credential_to_issuer_schema_id(identifier: &str) -> Option<FieldElement> {
    match identifier {
        "orb" => Some(FieldElement::from(1_u64)),
        "face" => Some(FieldElement::from(2_u64)),
        "secure_document" => Some(FieldElement::from(3_u64)),
        "document" => Some(FieldElement::from(4_u64)),
        "device" => Some(FieldElement::from(5_u64)),
        _ => None,
    }
}

/// Maps issuer schema ID back to credential identifier.
///
/// # Arguments
/// * `id` - The `FieldElement` issuer schema ID
///
/// # Returns
/// * `Some(&'static str)` - The credential identifier for known IDs
/// * `None` - For unknown issuer schema IDs
#[must_use]
pub fn issuer_schema_id_to_credential(id: &FieldElement) -> Option<&'static str> {
    // Compare directly against known values
    if *id == FieldElement::from(1_u64) {
        Some("orb")
    } else if *id == FieldElement::from(2_u64) {
        Some("face")
    } else if *id == FieldElement::from(3_u64) {
        Some("secure_document")
    } else if *id == FieldElement::from(4_u64) {
        Some("document")
    } else if *id == FieldElement::from(5_u64) {
        Some("device")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_to_issuer_schema_id() {
        assert!(credential_to_issuer_schema_id("orb").is_some());
        assert!(credential_to_issuer_schema_id("face").is_some());
        assert!(credential_to_issuer_schema_id("secure_document").is_some());
        assert!(credential_to_issuer_schema_id("document").is_some());
        assert!(credential_to_issuer_schema_id("device").is_some());
        assert!(credential_to_issuer_schema_id("unknown").is_none());
    }

    #[test]
    fn test_issuer_schema_id_to_credential() {
        assert_eq!(
            issuer_schema_id_to_credential(&FieldElement::from(1_u64)),
            Some("orb")
        );
        assert_eq!(
            issuer_schema_id_to_credential(&FieldElement::from(5_u64)),
            Some("device")
        );
        assert_eq!(
            issuer_schema_id_to_credential(&FieldElement::from(99_u64)),
            None
        );
    }

    #[test]
    fn test_roundtrip() {
        for cred in ["orb", "face", "secure_document", "document", "device"] {
            let id = credential_to_issuer_schema_id(cred).unwrap();
            assert_eq!(issuer_schema_id_to_credential(&id), Some(cred));
        }
    }
}
