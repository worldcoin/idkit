//! Credential presets for simplified World ID session creation
//!
//! Presets provide a simplified API for common credential request patterns,
//! automatically handling both World ID 4.0 and 3.0 protocol formats.

use crate::types::IdentityAttribute;
#[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
use crate::types::{CredentialRequest, CredentialType, VerificationLevel};
#[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
use crate::{ConstraintNode, Signal};
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

    /// Proof of human verification (World ID 4.0 with legacy fallback)
    ///
    /// Requests a World ID 4.0 proof-of-human credential, with optional signal.
    /// Falls back to legacy Orb proofs when World ID 4.0 is unavailable.
    ProofOfHuman {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },

    /// Passport verification (World ID 4.0 with legacy fallback)
    ///
    /// Requests a World ID 4.0 passport credential, with optional signal.
    /// Falls back to legacy document proofs when World ID 4.0 is unavailable.
    Passport {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },

    /// MNC (My Number Card) verification (World ID 4.0 with legacy fallback)
    ///
    /// Requests a World ID 4.0 MNC credential, with optional signal.
    /// Falls back to legacy document proofs when World ID 4.0 is unavailable.
    Mnc {
        /// Optional signal to include in the proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        signal: Option<String>,
    },

    /// Document-based identity attestation (World ID 4.0)
    ///
    /// Requests an NFC document or MNC (JP My Number Card) credential.
    ///
    /// It is not supported for native v1 payloads or session flows.
    IdentityCheck {
        /// Identity attribute filters the verifier wants to assert.
        attributes: Vec<IdentityAttribute>,
        /// Optional signal to include in legacy (World ID 3.0) proof.
        /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
        legacy_signal: Option<String>,
    },
}

#[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
pub(crate) struct BridgeParams {
    pub constraints: Option<ConstraintNode>,
    pub legacy_verification_level: Option<VerificationLevel>,
    pub legacy_signal: Option<String>,
    pub identity_attributes: Option<Vec<IdentityAttribute>>,
    pub allow_legacy_proofs_override: Option<bool>,
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

    /// Creates a new `ProofOfHuman` preset with optional signal
    #[must_use]
    pub fn proof_of_human(signal: Option<String>) -> Self {
        Self::ProofOfHuman { signal }
    }

    /// Creates a new `Passport` preset with optional signal
    #[must_use]
    pub fn passport(signal: Option<String>) -> Self {
        Self::Passport { signal }
    }

    /// Creates a new `Mnc` preset with optional signal
    #[must_use]
    pub fn mnc(signal: Option<String>) -> Self {
        Self::Mnc { signal }
    }

    #[must_use]
    pub fn identity_check(
        attributes: Vec<IdentityAttribute>,
        legacy_signal: Option<String>,
    ) -> Self {
        Self::IdentityCheck {
            attributes,
            legacy_signal,
        }
    }

    /// Converts the preset to bridge session parameters
    ///
    /// Returns a tuple of:
    /// - `ConstraintNode` - World ID 4.0 constraint tree
    /// - `VerificationLevel` - World ID 3.0 legacy verification level
    /// - `Option<String>` - Legacy signal string (if configured)
    /// - `Option<Vec<IdentityAttribute>>` - a list of identity attributes
    /// - `Option<bool>` - override for `allow_legacy_proofs` (`None` = let caller decide)
    // TODO: This should be removed it was introduced to keep legacy preset compatible with proof_request
    // TODO: but we decided to keep legacy presets only 3.0, will tackle separately
    #[cfg(any(test, feature = "ffi", feature = "wasm-bindings"))]
    #[must_use]
    pub(crate) fn into_bridge_params(self) -> BridgeParams {
        match self {
            Self::OrbLegacy { signal } => BridgeParams {
                constraints: None,
                legacy_verification_level: Some(VerificationLevel::Orb),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: None,
            },
            Self::SecureDocumentLegacy { signal } => BridgeParams {
                constraints: None,
                legacy_verification_level: Some(VerificationLevel::SecureDocument),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: None,
            },
            Self::DocumentLegacy { signal } => BridgeParams {
                constraints: None,
                legacy_verification_level: Some(VerificationLevel::Document),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: None,
            },
            Self::SelfieCheckLegacy { signal } => BridgeParams {
                constraints: None,
                legacy_verification_level: Some(VerificationLevel::Face),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: None,
            },
            Self::DeviceLegacy { signal } => BridgeParams {
                constraints: None,
                legacy_verification_level: Some(VerificationLevel::Device),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: None,
            },
            Self::ProofOfHuman { signal } => BridgeParams {
                constraints: Some(ConstraintNode::item(CredentialRequest::new(
                    CredentialType::ProofOfHuman,
                    signal.clone().map(Signal::from_string),
                ))),
                legacy_verification_level: Some(VerificationLevel::Orb),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: Some(true),
            },
            Self::Passport { signal } => BridgeParams {
                constraints: Some(ConstraintNode::item(CredentialRequest::new(
                    CredentialType::Passport,
                    signal.clone().map(Signal::from_string),
                ))),
                legacy_verification_level: Some(VerificationLevel::Document),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: Some(true),
            },
            Self::Mnc { signal } => BridgeParams {
                constraints: Some(ConstraintNode::item(CredentialRequest::new(
                    CredentialType::Mnc,
                    signal.clone().map(Signal::from_string),
                ))),
                legacy_verification_level: Some(VerificationLevel::Document),
                legacy_signal: signal,
                identity_attributes: None,
                allow_legacy_proofs_override: Some(true),
            },
            Self::IdentityCheck {
                attributes,
                legacy_signal,
            } => {
                let passport = CredentialRequest::new(
                    CredentialType::Passport,
                    legacy_signal.clone().map(Signal::from_string),
                );
                let mnc = CredentialRequest::new(
                    CredentialType::Mnc,
                    legacy_signal.clone().map(Signal::from_string),
                );

                let constraints = ConstraintNode::any(vec![
                    ConstraintNode::item(passport),
                    ConstraintNode::item(mnc),
                ]);

                BridgeParams {
                    constraints: Some(constraints),
                    legacy_verification_level: Some(VerificationLevel::Document),
                    legacy_signal,
                    identity_attributes: Some(attributes),
                    allow_legacy_proofs_override: Some(true),
                }
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
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Face)
        );
        assert_eq!(bridge_params.legacy_signal, Some("face-signal".to_string()));
        assert_eq!(bridge_params.identity_attributes, None);
        assert!(bridge_params.constraints.is_none());
    }

    #[test]
    fn selfie_check_legacy_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::selfie_check_legacy(None);
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Face)
        );
        assert_eq!(bridge_params.legacy_signal, None);
        assert_eq!(bridge_params.identity_attributes, None);
        assert!(bridge_params.constraints.is_none());
    }

    #[test]
    fn device_legacy_preset_builds_orb_only_constraints_and_device_legacy_level() {
        let preset = Preset::device_legacy(Some("device-signal".to_string()));
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Device)
        );
        assert_eq!(
            bridge_params.legacy_signal,
            Some("device-signal".to_string())
        );
        assert_eq!(bridge_params.identity_attributes, None);
        assert!(bridge_params.constraints.is_none());
    }

    #[test]
    fn device_legacy_preset_without_signal_preserves_empty_signal() {
        let preset = Preset::device_legacy(None);
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Device)
        );
        assert_eq!(bridge_params.legacy_signal, None);
        assert_eq!(bridge_params.identity_attributes, None);
        assert!(bridge_params.constraints.is_none());
    }

    #[test]
    fn proof_of_human_preset_builds_v4_constraint_with_legacy_orb_fallback() {
        let preset = Preset::proof_of_human(Some("poh-signal".to_string()));
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Orb)
        );
        assert_eq!(bridge_params.legacy_signal, Some("poh-signal".to_string()));
        assert_eq!(bridge_params.identity_attributes, None);
        assert_eq!(bridge_params.allow_legacy_proofs_override, Some(true));

        match bridge_params.constraints {
            Some(ConstraintNode::Item(item)) => {
                assert_eq!(item.credential_type, CredentialType::ProofOfHuman);
                assert_eq!(
                    item.signal.as_ref().and_then(Signal::as_str),
                    Some("poh-signal")
                );
            }
            _ => panic!("expected proofOfHuman constraint to be one proof_of_human item"),
        }
    }

    #[test]
    fn passport_preset_builds_v4_constraint_with_legacy_document_fallback() {
        let preset = Preset::passport(Some("passport-signal".to_string()));
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Document)
        );
        assert_eq!(
            bridge_params.legacy_signal,
            Some("passport-signal".to_string())
        );
        assert_eq!(bridge_params.identity_attributes, None);
        assert_eq!(bridge_params.allow_legacy_proofs_override, Some(true));

        match bridge_params.constraints {
            Some(ConstraintNode::Item(item)) => {
                assert_eq!(item.credential_type, CredentialType::Passport);
                assert_eq!(
                    item.signal.as_ref().and_then(Signal::as_str),
                    Some("passport-signal")
                );
            }
            _ => panic!("expected passport constraint to be one passport item"),
        }
    }

    #[test]
    fn mnc_preset_builds_v4_constraint_with_legacy_document_fallback() {
        let preset = Preset::mnc(Some("mnc-signal".to_string()));
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Document)
        );
        assert_eq!(bridge_params.legacy_signal, Some("mnc-signal".to_string()));
        assert_eq!(bridge_params.identity_attributes, None);
        assert_eq!(bridge_params.allow_legacy_proofs_override, Some(true));

        match bridge_params.constraints {
            Some(ConstraintNode::Item(item)) => {
                assert_eq!(item.credential_type, CredentialType::Mnc);
                assert_eq!(
                    item.signal.as_ref().and_then(Signal::as_str),
                    Some("mnc-signal")
                );
            }
            _ => panic!("expected mnc constraint to be one mnc item"),
        }
    }

    #[test]
    fn identity_check_preset_builds_document_constraints_and_preserves_attributes() {
        let attributes = vec![
            IdentityAttribute::Nationality("JPN".to_string()),
            IdentityAttribute::MinimumAge(21),
        ];
        let preset = Preset::identity_check(attributes.clone(), None);
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Document)
        );
        assert_eq!(bridge_params.legacy_signal, None);
        assert_eq!(bridge_params.identity_attributes, Some(attributes));
        assert_eq!(bridge_params.allow_legacy_proofs_override, Some(true));

        match bridge_params.constraints {
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
    fn identity_check_with_legacy_signal_sets_signal_and_document_level() {
        let attributes = vec![IdentityAttribute::MinimumAge(18)];
        let preset = Preset::identity_check(attributes.clone(), Some("my-signal".to_string()));
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Document)
        );
        assert_eq!(bridge_params.legacy_signal, Some("my-signal".to_string()));
        assert_eq!(bridge_params.identity_attributes, Some(attributes));
        assert_eq!(bridge_params.allow_legacy_proofs_override, Some(true));

        match bridge_params.constraints {
            Some(ConstraintNode::Any { any }) => {
                assert_eq!(any.len(), 2);

                match &any[0] {
                    ConstraintNode::Item(item) => {
                        assert_eq!(item.credential_type, CredentialType::Passport);
                        assert_eq!(
                            item.signal.as_ref().and_then(Signal::as_str),
                            Some("my-signal")
                        );
                    }
                    _ => panic!("expected first identityCheck constraint to be passport"),
                }

                match &any[1] {
                    ConstraintNode::Item(item) => {
                        assert_eq!(item.credential_type, CredentialType::Mnc);
                        assert_eq!(
                            item.signal.as_ref().and_then(Signal::as_str),
                            Some("my-signal")
                        );
                    }
                    _ => panic!("expected second identityCheck constraint to be mnc"),
                }
            }
            _ => panic!("expected identityCheck constraints to be an any node"),
        }
    }

    #[test]
    fn orb_legacy_preset_decodes_address_shaped_signal_as_bytes() {
        let address = "0x3df41d9d0ba00d8fbe5a9896bb01efc4b3787b7c";
        let preset = Preset::orb_legacy(Some(address.to_string()));
        let bridge_params = preset.into_bridge_params();

        assert_eq!(
            bridge_params.legacy_verification_level,
            Some(VerificationLevel::Orb)
        );
        assert_eq!(bridge_params.legacy_signal, Some(address.to_string()));
        assert_eq!(bridge_params.identity_attributes, None);
        assert!(bridge_params.constraints.is_none());

        // Signal decoding (address → 20-byte Bytes) happens in the bridge layer
        // via CachedSignalHashes::compute; verify the Signal type here independently.
        let signal = Signal::from_string(address.to_string());
        assert!(matches!(signal, Signal::Bytes(_)));
        assert_eq!(signal.as_bytes().len(), 20);
    }
}
