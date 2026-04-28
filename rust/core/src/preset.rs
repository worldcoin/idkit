//! Credential presets for simplified World ID session creation
//!
//! Presets provide a simplified API for common credential request patterns,
//! automatically handling both World ID 4.0 and 3.0 protocol formats.

use crate::types::IdentityAttribute;
#[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
use crate::types::{CredentialRequest, CredentialType, VerificationLevel};
#[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
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

    /// Document-based identity attestation (World ID 4.0)
    ///
    /// Requests passport or national identity card credentials, with optional
    /// proof-of-humanity requirement.
    ///
    /// This preset requires World ID 4.0-compatible clients. It is not supported
    /// for native v1 payloads or session flows.
    IdentityCheck {
        /// Identity attribute filters the verifier wants to assert.
        attributes: Vec<IdentityAttribute>,
        /// When `true`, also requires an orb-verified proof-of-humanity credential.
        require_proof_of_humanity: bool,
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

    #[must_use]
    pub fn identity_check(
        attributes: Vec<IdentityAttribute>,
        require_proof_of_humanity: bool,
    ) -> Self {
        Self::IdentityCheck {
            attributes,
            require_proof_of_humanity,
        }
    }

    /// Converts the preset to bridge session parameters
    ///
    /// Returns a tuple of:
    /// - `ConstraintNode` - World ID 4.0 constraint tree
    /// - `VerificationLevel` - World ID 3.0 legacy verification level
    /// - `Option<String>` - Legacy signal string (if configured)
    /// - `Option<Vec<IdentityAttribute>>` - a list of identity attributes
    // TODO: This should be removed it was introduced to keep legacy preset compatible with proof_request
    // TODO: but we decided to keep legacy presets only 3.0, will tackle separately
    #[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
    #[must_use]
    pub(crate) fn into_bridge_params(
        self,
    ) -> (
        Option<ConstraintNode>,
        Option<VerificationLevel>,
        Option<String>,
        Option<Vec<IdentityAttribute>>,
    ) {
        match self {
            Self::OrbLegacy { signal } => (None, Some(VerificationLevel::Orb), signal, None),
            Self::SecureDocumentLegacy { signal } => {
                (None, Some(VerificationLevel::SecureDocument), signal, None)
            }
            Self::DocumentLegacy { signal } => {
                (None, Some(VerificationLevel::Document), signal, None)
            }
            Self::SelfieCheckLegacy { signal } => {
                (None, Some(VerificationLevel::Face), signal, None)
            }
            Self::DeviceLegacy { signal } => (None, Some(VerificationLevel::Device), signal, None),
            Self::IdentityCheck {
                attributes,
                require_proof_of_humanity,
            } => {
                let passport = CredentialRequest::new(CredentialType::Passport, None);
                let mnc = CredentialRequest::new(CredentialType::Mnc, None);
                let proof_of_human = CredentialRequest::new(CredentialType::ProofOfHuman, None);

                let documents = ConstraintNode::any(vec![
                    ConstraintNode::item(passport),
                    ConstraintNode::item(mnc),
                ]);

                let constraints = if require_proof_of_humanity {
                    ConstraintNode::all(vec![documents, ConstraintNode::item(proof_of_human)])
                } else {
                    documents
                };

                (Some(constraints), None, None, Some(attributes))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Signal;

    #[test]
    fn selfie_check_legacy_preset_builds_face_only_constraints_and_face_legacy_level() {
        let preset = Preset::selfie_check_legacy(Some("face-signal".to_string()));
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, Some(VerificationLevel::Face));
        assert_eq!(legacy_signal, Some("face-signal".to_string()));
        assert_eq!(identity_attributes, None);
        assert!(constraints.is_none());
    }

    #[test]
    fn selfie_check_legacy_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::selfie_check_legacy(None);
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, Some(VerificationLevel::Face));
        assert_eq!(legacy_signal, None);
        assert_eq!(identity_attributes, None);
        assert!(constraints.is_none());
    }

    #[test]
    fn device_legacy_preset_builds_orb_only_constraints_and_device_legacy_level() {
        let preset = Preset::device_legacy(Some("device-signal".to_string()));
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, Some(VerificationLevel::Device));
        assert_eq!(legacy_signal, Some("device-signal".to_string()));
        assert_eq!(identity_attributes, None);
        assert!(constraints.is_none());
    }

    #[test]
    fn device_legacy_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::device_legacy(None);
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, Some(VerificationLevel::Device));
        assert_eq!(legacy_signal, None);
        assert_eq!(identity_attributes, None);
        assert!(constraints.is_none());
    }

    #[test]
    fn identity_check_preset_builds_document_constraints_and_preserves_attributes() {
        let attributes = vec![
            IdentityAttribute::Nationality("JPN".to_string()),
            IdentityAttribute::MinimumAge(21),
        ];
        let preset = Preset::identity_check(attributes.clone(), false);
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, None);
        assert_eq!(legacy_signal, None);
        assert_eq!(identity_attributes, Some(attributes));

        match constraints {
            Some(ConstraintNode::Any { any }) => {
                assert_eq!(any.len(), 2);

                match &any[0] {
                    ConstraintNode::Item(item) => {
                        assert_eq!(item.credential_type, CredentialType::Passport);
                        assert_eq!(item.signal, None);
                    }
                    _ => panic!("expected first identityCheck constraint to be passport"),
                }

                match &any[1] {
                    ConstraintNode::Item(item) => {
                        assert_eq!(item.credential_type, CredentialType::Mnc);
                        assert_eq!(item.signal, None);
                    }
                    _ => panic!("expected second identityCheck constraint to be mnc"),
                }
            }
            _ => panic!("expected identityCheck constraints to be an any node"),
        }
    }

    #[test]
    fn identity_check_preset_with_orb_builds_enumerated_constraints_and_preserves_attributes() {
        let attributes = vec![
            IdentityAttribute::IssuingCountry("JPN".to_string()),
            IdentityAttribute::DocumentNumber("AB123456".to_string()),
        ];
        let preset = Preset::identity_check(attributes.clone(), true);
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, None);
        assert_eq!(legacy_signal, None);
        assert_eq!(identity_attributes, Some(attributes));

        match constraints {
            Some(ConstraintNode::All { all }) => {
                assert_eq!(all.len(), 2);

                match &all[0] {
                    ConstraintNode::Any { any } => {
                        assert_eq!(any.len(), 2);

                        match &any[0] {
                            ConstraintNode::Item(item) => {
                                assert_eq!(item.credential_type, CredentialType::Passport);
                                assert_eq!(item.signal, None);
                            }
                            _ => panic!(
                                "expected first identityCheck with_orb branch to be passport"
                            ),
                        }

                        match &any[1] {
                            ConstraintNode::Item(item) => {
                                assert_eq!(item.credential_type, CredentialType::Mnc);
                                assert_eq!(item.signal, None);
                            }
                            _ => panic!("expected second identityCheck with_orb branch to be mnc"),
                        }
                    }
                    _ => panic!("expected first identityCheck with_orb node to be any"),
                }

                match &all[1] {
                    ConstraintNode::Item(item) => {
                        assert_eq!(item.credential_type, CredentialType::ProofOfHuman);
                        assert_eq!(item.signal, None);
                    }
                    _ => panic!("expected second identityCheck with_orb node to be orb"),
                }
            }
            _ => panic!("expected identityCheck with_orb constraints to be an all node"),
        }
    }

    #[test]
    fn orb_legacy_preset_decodes_address_shaped_signal_as_bytes() {
        let address = "0x3df41d9d0ba00d8fbe5a9896bb01efc4b3787b7c";
        let preset = Preset::orb_legacy(Some(address.to_string()));
        let (constraints, verification_level, legacy_signal, identity_attributes) =
            preset.into_bridge_params();

        assert_eq!(verification_level, Some(VerificationLevel::Orb));
        assert_eq!(legacy_signal, Some(address.to_string()));
        assert_eq!(identity_attributes, None);
        assert!(constraints.is_none());

        // Signal decoding (address → 20-byte Bytes) happens in the bridge layer
        // via CachedSignalHashes::compute; verify the Signal type here independently.
        let signal = Signal::from_string(address.to_string());
        assert!(matches!(signal, Signal::Bytes(_)));
        assert_eq!(signal.as_bytes().len(), 20);
    }
}
