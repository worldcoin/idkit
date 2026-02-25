//! Credential presets for simplified World ID session creation
//!
//! Presets provide a simplified API for common credential request patterns,
//! automatically handling both World ID 4.0 and 3.0 protocol formats.

use crate::types::{CredentialRequest, CredentialType, Signal, VerificationLevel};
use crate::ConstraintNode;
use serde::{Deserialize, Serialize};

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
    OrbLegacy {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },
    /// Secure document verification
    ///
    /// Requests secure document-verified credentials only, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
    SecureDocumentLegacy {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },
    /// Document verification
    ///
    /// Requests document-verified credentials only, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
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
    /// This preset requests face credentials in v4 constraints and maps to
    /// legacy `verification_level = face` for v3 compatibility fields.
    ///
    /// Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
    SelfieCheck {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
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

    /// Creates a new `SelfieCheck` preset with optional signal
    ///
    /// Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
    #[must_use]
    pub fn selfie_check(signal: Option<String>) -> Self {
        Self::SelfieCheck { signal }
    }

    /// Converts the preset to bridge session parameters
    ///
    /// Returns a tuple of:
    /// - `ConstraintNode` - World ID 4.0 constraint tree
    /// - `VerificationLevel` - World ID 3.0 legacy verification level
    /// - `Option<String>` - Legacy signal string (if configured)
    #[must_use]
    pub fn to_bridge_params(&self) -> (ConstraintNode, VerificationLevel, Option<String>) {
        match self {
            Self::OrbLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::Orb, signal_opt);
                let constraints = ConstraintNode::Item(orb); // OrbLegacy doesn't need constraints
                let legacy_verification_level = VerificationLevel::Orb;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::SecureDocumentLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                // Legacy VerificationLevel::Document will return the maximum credential type
                // so this becomes any(orb, secure_document)
                let orb = CredentialRequest::new(CredentialType::Orb, signal_opt.clone());
                let secure_doc = CredentialRequest::new(CredentialType::SecureDocument, signal_opt);
                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::Item(orb),
                    ConstraintNode::Item(secure_doc),
                ]);
                let legacy_verification_level = VerificationLevel::SecureDocument;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::DocumentLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                // Legacy VerificationLevel::Document will return the maximum credential type
                // so this becomes any(orb, secure_document, document)
                let orb = CredentialRequest::new(CredentialType::Orb, signal_opt.clone());
                let secure_doc =
                    CredentialRequest::new(CredentialType::SecureDocument, signal_opt.clone());
                let doc = CredentialRequest::new(CredentialType::Document, signal_opt);
                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::Item(orb),
                    ConstraintNode::Item(secure_doc),
                    ConstraintNode::Item(doc),
                ]);
                let legacy_verification_level = VerificationLevel::Document;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::SelfieCheck { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let face = CredentialRequest::new(CredentialType::Face, signal_opt);
                let constraints = ConstraintNode::Item(face);
                let legacy_verification_level = VerificationLevel::Face;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selfie_check_preset_builds_face_only_constraints_and_face_legacy_level() {
        let preset = Preset::selfie_check(Some("face-signal".to_string()));
        let (constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        assert_eq!(verification_level, VerificationLevel::Face);
        assert_eq!(legacy_signal, Some("face-signal".to_string()));

        match constraints {
            ConstraintNode::Item(item) => {
                assert_eq!(item.credential_type, CredentialType::Face);
                assert_eq!(item.signal, Some(Signal::from_string("face-signal")));
            }
            _ => panic!("expected selfieCheck constraints to be a single item"),
        }
    }

    #[test]
    fn selfie_check_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::selfie_check(None);
        let (constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        assert_eq!(verification_level, VerificationLevel::Face);
        assert_eq!(legacy_signal, None);

        match constraints {
            ConstraintNode::Item(item) => {
                assert_eq!(item.credential_type, CredentialType::Face);
                assert_eq!(item.signal, None);
            }
            _ => panic!("expected selfieCheck constraints to be a single item"),
        }
    }
}
