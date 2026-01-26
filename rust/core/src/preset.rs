//! Credential presets for simplified World ID session creation
//!
//! Presets provide a simplified API for common credential request patterns,
//! automatically handling both World ID 4.0 and 3.0 protocol formats.

use crate::types::{CredentialType, CredentialRequest, Signal, VerificationLevel};
use crate::ConstraintNode;
use serde::{Deserialize, Serialize};

/// Configuration for `OrbLegacy` preset
///
/// Requests orb-verified credentials only, with optional signal.
/// The signal can be either a plain string or a hex-encoded ABI value (with 0x prefix).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Record))]
pub struct OrbLegacyPreset {
    /// Optional signal to include in the proof.
    /// Can be a plain string or hex-encoded ABI value (with 0x prefix).
    pub signal: Option<String>,
}

impl OrbLegacyPreset {
    /// Creates a new `OrbLegacyPreset` with optional signal
    #[must_use]
    pub fn new(signal: Option<String>) -> Self {
        Self { signal }
    }
}

/// Credential presets for World ID verification
///
/// Each preset defines a pre-configured set of credential requests
/// with sensible defaults. Presets convert to both World ID 4.0
/// (requests array) and World ID 3.0 (`verification_level`) formats.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Enum))]
#[serde(tag = "type", content = "data")]
pub enum Preset {
    /// Orb-only verification (highest assurance level)
    OrbLegacy(OrbLegacyPreset),
}

impl Preset {
    /// Converts the preset to bridge session parameters
    ///
    /// Returns a tuple of:
    /// - `ConstraintNode` - World ID 4.0 constraint tree
    /// - `VerificationLevel` - World ID 3.0 legacy verification level
    /// - `Option<String>` - Legacy signal string (if configured)
    #[must_use]
    pub fn to_bridge_params(&self) -> (ConstraintNode, VerificationLevel, Option<String>) {
        match self {
            Self::OrbLegacy(config) => {
                let signal = config
                    .signal
                    .as_ref()
                    .map(|s| Signal::from_string(s.clone()));
                let orb = CredentialRequest::new(CredentialType::Orb, signal);
                let constraints = ConstraintNode::Item(orb); // OrbLegacy doesn't need constraints
                let legacy_verification_level = VerificationLevel::Orb;
                let legacy_signal = config.signal.clone();

                (constraints, legacy_verification_level, legacy_signal)
            }
        }
    }
}
