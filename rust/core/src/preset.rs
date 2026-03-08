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
    /// Device verification
    ///
    /// Requests orb or device credentials, with optional signal.
    /// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
    ///
    /// This preset only returns World ID 3.0 proofs. Use it for compatibility with older `IDKit` versions.
    DeviceLegacy {
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

    /// Creates a new `SelfieCheckLegacy` preset with optional signal
    ///
    /// Preview: Selfie Check is currently in preview. Contact us if you need it enabled.
    #[must_use]
    pub fn selfie_check_legacy(signal: Option<String>) -> Self {
        Self::SelfieCheckLegacy { signal }
    }

    /// Creates a new `DeviceLegacy` preset with optional signal
    #[must_use]
    pub fn device_legacy(signal: Option<String>) -> Self {
        Self::DeviceLegacy { signal }
    }

    /// Converts the preset to bridge session parameters
    ///
    /// Returns a tuple of:
    /// - `ConstraintNode` - World ID 4.0 constraint tree
    /// - `VerificationLevel` - World ID 3.0 legacy verification level
    /// - `Option<String>` - Legacy signal string (if configured)
    // TODO: This should be removed it was introduced to keep legacy preset compatible with proof_request
    // TODO: but we decided to keep legacy presets only 3.0, will tackle separately
    #[must_use]
    pub fn to_bridge_params(&self) -> (ConstraintNode, VerificationLevel, Option<String>) {
        match self {
            Self::OrbLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::ProofOfHuman, signal_opt);
                let constraints = ConstraintNode::Item(orb); // OrbLegacy doesn't need constraints
                let legacy_verification_level = VerificationLevel::Orb;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::SecureDocumentLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::ProofOfHuman, signal_opt.clone());
                let passport = CredentialRequest::new(CredentialType::Passport, signal_opt);
                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::Item(orb),
                    ConstraintNode::Item(passport),
                ]);
                let legacy_verification_level = VerificationLevel::SecureDocument;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::DocumentLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::ProofOfHuman, signal_opt.clone());
                let passport = CredentialRequest::new(CredentialType::Passport, signal_opt.clone());
                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::Item(orb),
                    ConstraintNode::Item(passport),
                ]);
                let legacy_verification_level = VerificationLevel::Document;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::SelfieCheckLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let face = CredentialRequest::new(CredentialType::Face, signal_opt);
                let constraints = ConstraintNode::Item(face);
                let legacy_verification_level = VerificationLevel::Face;
                let legacy_signal = signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
            Self::DeviceLegacy { signal } => {
                let signal_opt = signal.as_ref().map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::ProofOfHuman, signal_opt);
                let constraints = ConstraintNode::Item(orb);
                let legacy_verification_level = VerificationLevel::Device;
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
    fn selfie_check_legacy_preset_builds_face_only_constraints_and_face_legacy_level() {
        let preset = Preset::selfie_check_legacy(Some("face-signal".to_string()));
        let (constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        assert_eq!(verification_level, VerificationLevel::Face);
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
        let (constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        assert_eq!(verification_level, VerificationLevel::Face);
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
    fn device_legacy_preset_builds_orb_only_constraints_and_device_legacy_level() {
        let preset = Preset::device_legacy(Some("device-signal".to_string()));
        let (constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        assert_eq!(verification_level, VerificationLevel::Device);
        assert_eq!(legacy_signal, Some("device-signal".to_string()));

        match constraints {
            ConstraintNode::Item(orb) => {
                assert_eq!(orb.credential_type, CredentialType::ProofOfHuman);
                assert_eq!(orb.signal, Some(Signal::from_string("device-signal")));
            }
            _ => panic!("expected deviceLegacy constraints to be a single orb item"),
        }
    }

    #[test]
    fn device_legacy_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::device_legacy(None);
        let (constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        assert_eq!(verification_level, VerificationLevel::Device);
        assert_eq!(legacy_signal, None);

        match constraints {
            ConstraintNode::Item(orb) => {
                assert_eq!(orb.credential_type, CredentialType::ProofOfHuman);
                assert_eq!(orb.signal, None);
            }
            _ => panic!("expected deviceLegacy constraints to be a single orb item"),
        }
    }
}
