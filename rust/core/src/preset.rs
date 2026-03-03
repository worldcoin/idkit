//! Credential presets for simplified World ID session creation
//!
//! Presets provide a simplified API for common credential request patterns,
//! automatically handling both World ID 4.0 and 3.0 protocol formats.

use crate::error::{Error, Result};
use crate::types::{
    CredentialCategory, CredentialRequest, CredentialType, Signal, VerificationLevel,
};
use crate::ConstraintNode;
use serde::{Deserialize, Serialize};

/// How to encode the legacy v1 compatibility field in the bridge payload.
#[derive(Debug, Clone)]
pub enum LegacyV1Params {
    /// Use `"verification_level": "<level>"` (existing behaviour)
    VerificationLevel(VerificationLevel),
    /// Use `"credential_categories": [...]` (old v1 credentialCategories API)
    CredentialCategories(Vec<CredentialCategory>),
}

/// Credential presets for World ID verification
///
/// Each preset defines a pre-configured set of credential requests
/// with sensible defaults. Presets convert to both World ID 4.0
/// (requests array) and World ID 3.0 (`verification_level`) formats.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(tag = "type")]
pub enum Preset {
    /// Orb-only verification (highest assurance level)
    ///
    /// Requests orb-verified credentials only, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
    ///
    /// This preset only returns World ID 3.0 proofs. Use it for compatibility with older `IDKit` versions.
    OrbLegacy {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },
    /// Secure document verification
    ///
    /// Requests secure document-verified credentials only, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
    ///
    /// This preset only returns World ID 3.0 proofs. Use it for compatibility with older `IDKit` versions.
    SecureDocumentLegacy {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },
    /// Document verification
    ///
    /// Requests document-verified credentials only, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
    ///
    /// This preset only returns World ID 3.0 proofs. Use it for compatibility with older `IDKit` versions.
    DocumentLegacy {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },
    /// Selfie check verification
    ///
    /// Requests face credentials only, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
    ///
    /// This preset only returns World ID 3.0 proofs. Use it for compatibility with older `IDKit` versions.
    ///
    /// Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
    SelfieCheckLegacy {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },
    /// Credential categories (v1 legacy style)
    ///
    /// Accepts an arbitrary non-empty set of credential categories and sends them as
    /// `credential_categories` in the bridge payload, mirroring the old v1 API.
    CredentialCategoriesLegacy {
        credential_categories: Vec<CredentialCategory>,
        signal: Option<String>,
    },
}

impl Preset {
    /// Creates a new `OrbLegacy` preset with optional signal
    #[must_use]
    pub fn orb_legacy(signal: Option<String>) -> Self {
        Self::OrbLegacy { signal }
    }

    /// Creates a new `SecureDocumentLegacy` preset with optional signal
    #[must_use]
    pub fn secure_document_legacy(signal: Option<String>) -> Self {
        Self::SecureDocumentLegacy { signal }
    }

    /// Creates a new `DocumentLegacy` preset with optional signal
    #[must_use]
    pub fn document_legacy(signal: Option<String>) -> Self {
        Self::DocumentLegacy { signal }
    }

    /// Creates a new `SelfieCheckLegacy` preset with optional signal
    ///
    /// Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
    #[must_use]
    pub fn selfie_check_legacy(signal: Option<String>) -> Self {
        Self::SelfieCheckLegacy { signal }
    }

    /// Creates a `CredentialCategoriesLegacy` preset.
    ///
    /// # Errors
    ///
    /// Returns an error if `credential_categories` is empty.
    pub fn credential_categories_legacy(
        credential_categories: Vec<CredentialCategory>,
        signal: Option<String>,
    ) -> Result<Self> {
        if credential_categories.is_empty() {
            return Err(Error::InvalidConfiguration(
                "credential_categories must not be empty".to_string(),
            ));
        }
        Ok(Self::CredentialCategoriesLegacy {
            credential_categories,
            signal,
        })
    }

    /// Converts the preset to bridge session parameters.
    ///
    /// Returns a tuple of:
    /// - `ConstraintNode` - World ID 4.0 constraint tree
    /// - `LegacyV1Params` - World ID 3.0 legacy encoding (verification level or credential categories)
    /// - `Option<String>` - Legacy signal string (if configured)
    ///
    /// # Panics
    ///
    /// Panics if called on a `CredentialCategoriesLegacy` variant with an empty
    /// `credential_categories` list. Use [`Preset::credential_categories_legacy`] to construct
    /// this variant, which rejects empty lists at construction time.
    #[must_use]
    pub fn to_bridge_params(&self) -> (ConstraintNode, LegacyV1Params, Option<String>) {
        match self {
            Self::OrbLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::Orb, signal_opt);
                let constraints = ConstraintNode::Item(orb); // OrbLegacy doesn't need constraints
                let legacy_signal = signal.clone();

                (
                    constraints,
                    LegacyV1Params::VerificationLevel(VerificationLevel::Orb),
                    legacy_signal,
                )
            }
            Self::SecureDocumentLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::Orb, signal_opt.clone());
                let secure_doc = CredentialRequest::new(CredentialType::SecureDocument, signal_opt);
                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::Item(orb),
                    ConstraintNode::Item(secure_doc),
                ]);
                let legacy_signal = signal.clone();

                (
                    constraints,
                    LegacyV1Params::VerificationLevel(VerificationLevel::SecureDocument),
                    legacy_signal,
                )
            }
            Self::DocumentLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::Orb, signal_opt.clone());
                let secure_doc =
                    CredentialRequest::new(CredentialType::SecureDocument, signal_opt.clone());
                let doc = CredentialRequest::new(CredentialType::Document, signal_opt);
                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::Item(orb),
                    ConstraintNode::Item(secure_doc),
                    ConstraintNode::Item(doc),
                ]);
                let legacy_signal = signal.clone();

                (
                    constraints,
                    LegacyV1Params::VerificationLevel(VerificationLevel::Document),
                    legacy_signal,
                )
            }
            Self::SelfieCheckLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let face = CredentialRequest::new(CredentialType::Face, signal_opt);
                let constraints = ConstraintNode::Item(face);
                let legacy_signal = signal.clone();

                (
                    constraints,
                    LegacyV1Params::VerificationLevel(VerificationLevel::Face),
                    legacy_signal,
                )
            }
            Self::CredentialCategoriesLegacy {
                credential_categories,
                signal,
            } => {
                assert!(
                    !credential_categories.is_empty(),
                    "credential_categories must not be empty"
                );

                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));

                let credential_types: Vec<CredentialType> = credential_categories
                    .iter()
                    .map(|cat| match cat {
                        CredentialCategory::Personhood => CredentialType::Orb,
                        CredentialCategory::SecureDocument => CredentialType::SecureDocument,
                        CredentialCategory::Document => CredentialType::Document,
                    })
                    .collect();

                let constraints = match credential_types.as_slice() {
                    [single] => ConstraintNode::Item(CredentialRequest::new(*single, signal_opt)),
                    types => ConstraintNode::any(
                        types
                            .iter()
                            .map(|ct| {
                                ConstraintNode::Item(CredentialRequest::new(
                                    *ct,
                                    signal_opt.clone(),
                                ))
                            })
                            .collect(),
                    ),
                };

                (
                    constraints,
                    LegacyV1Params::CredentialCategories(credential_categories.clone()),
                    signal.clone(),
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selfie_check_legacy_preset_builds_face_only_constraints_and_face_legacy_level() {
        let preset = Preset::selfie_check_legacy(Some("face-signal".to_string()));
        let (constraints, legacy_v1_params, legacy_signal) = preset.to_bridge_params();

        assert!(
            matches!(
                legacy_v1_params,
                LegacyV1Params::VerificationLevel(VerificationLevel::Face)
            ),
            "expected VerificationLevel::Face"
        );
        assert_eq!(legacy_signal, Some("face-signal".to_string()));

        match constraints {
            ConstraintNode::Item(item) => {
                assert_eq!(item.credential_type, CredentialType::Face);
                assert_eq!(item.signal, Some(Signal::from_string("face-signal")));
            }
            _ => panic!("expected selfieCheckLegacy constraints to be a single item"),
        }
    }

    #[test]
    fn selfie_check_legacy_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::selfie_check_legacy(None);
        let (constraints, legacy_v1_params, legacy_signal) = preset.to_bridge_params();

        assert!(
            matches!(
                legacy_v1_params,
                LegacyV1Params::VerificationLevel(VerificationLevel::Face)
            ),
            "expected VerificationLevel::Face"
        );
        assert_eq!(legacy_signal, None);

        match constraints {
            ConstraintNode::Item(item) => {
                assert_eq!(item.credential_type, CredentialType::Face);
                assert_eq!(item.signal, None);
            }
            _ => panic!("expected selfieCheckLegacy constraints to be a single item"),
        }
    }

    #[test]
    fn credential_categories_legacy_single_type_builds_item_constraint() {
        let preset = Preset::credential_categories_legacy(
            vec![CredentialCategory::Personhood],
            Some("test-signal".to_string()),
        )
        .unwrap();
        let (constraints, _, legacy_signal) = preset.to_bridge_params();

        assert_eq!(legacy_signal, Some("test-signal".to_string()));
        match constraints {
            ConstraintNode::Item(item) => {
                assert_eq!(item.credential_type, CredentialType::Orb);
                assert_eq!(item.signal, Some(Signal::from_string("test-signal")));
            }
            _ => panic!("expected a single Item constraint"),
        }
    }

    #[test]
    fn credential_categories_legacy_multiple_types_builds_any_constraint() {
        let preset = Preset::credential_categories_legacy(
            vec![CredentialCategory::Personhood, CredentialCategory::Document],
            None,
        )
        .unwrap();
        let (constraints, _, legacy_signal) = preset.to_bridge_params();

        assert_eq!(legacy_signal, None);
        match constraints {
            ConstraintNode::Any { any } => {
                assert_eq!(any.len(), 2);
                assert!(
                    matches!(&any[0], ConstraintNode::Item(i) if i.credential_type == CredentialType::Orb)
                );
                assert!(
                    matches!(&any[1], ConstraintNode::Item(i) if i.credential_type == CredentialType::Document)
                );
            }
            _ => panic!("expected an Any constraint"),
        }
    }

    #[test]
    fn credential_categories_legacy_returns_categories_v1_params() {
        let categories = vec![CredentialCategory::Personhood, CredentialCategory::Document];
        let preset = Preset::credential_categories_legacy(categories.clone(), None).unwrap();
        let (_, legacy_v1_params, _) = preset.to_bridge_params();

        match legacy_v1_params {
            LegacyV1Params::CredentialCategories(cats) => assert_eq!(cats, categories),
            LegacyV1Params::VerificationLevel(_) => panic!("expected CredentialCategories"),
        }
    }
}
