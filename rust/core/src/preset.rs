//! Credential presets for simplified World ID session creation
//!
//! Presets provide a simplified API for common credential request patterns,
//! automatically handling both World ID 4.0 and 3.0 protocol formats.

use crate::constraints::Constraints;
use crate::types::{CredentialType, Request, Signal, VerificationLevel};
use serde::{Deserialize, Serialize};

/// Configuration for OrbLegacy preset
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
    /// Creates a new OrbLegacyPreset with optional signal
    #[must_use]
    pub fn new(signal: Option<String>) -> Self {
        Self { signal }
    }
}

/// Credential presets for World ID verification
///
/// Each preset defines a pre-configured set of credential requests
/// with sensible defaults. Presets convert to both World ID 4.0
/// (requests array) and World ID 3.0 (verification_level) formats.
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
    /// - `Vec<Request>` - World ID 4.0 request format
    /// - `Option<Constraints>` - Optional constraints for the session
    /// - `VerificationLevel` - World ID 3.0 legacy verification level
    /// - `Option<String>` - Legacy signal string (if configured)
    #[must_use]
    pub fn to_bridge_params(
        &self,
    ) -> (
        Vec<Request>,
        Option<Constraints>,
        VerificationLevel,
        Option<String>,
    ) {
        match self {
            Preset::OrbLegacy(config) => {
                let signal = config
                    .signal
                    .as_ref()
                    .map(|s| Signal::from_string(s.clone()));
                let requests = vec![Request::new(CredentialType::Orb, signal)];
                let constraints = None; // OrbLegacy doesn't need constraints
                let legacy_verification_level = VerificationLevel::Orb;
                let legacy_signal = config.signal.clone();

                (
                    requests,
                    constraints,
                    legacy_verification_level,
                    legacy_signal,
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_orb_legacy_preset_bridge_params_with_signal() {
        let preset = Preset::OrbLegacy(OrbLegacyPreset::new(Some("test_signal".to_string())));
        let (requests, constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        // Check requests
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].credential_type, CredentialType::Orb);
        assert!(requests[0].signal.is_some());

        // Check constraints (None for OrbLegacy)
        assert!(constraints.is_none());

        // Check legacy verification level
        assert_eq!(verification_level, VerificationLevel::Orb);

        // Check legacy signal
        assert_eq!(legacy_signal, Some("test_signal".to_string()));
    }

    #[test]
    fn test_orb_legacy_preset_bridge_params_no_signal() {
        let preset = Preset::OrbLegacy(OrbLegacyPreset::new(None));
        let (requests, constraints, verification_level, legacy_signal) = preset.to_bridge_params();

        // Check requests
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].credential_type, CredentialType::Orb);
        assert!(requests[0].signal.is_none());

        // Check constraints (None for OrbLegacy)
        assert!(constraints.is_none());

        // Check legacy verification level
        assert_eq!(verification_level, VerificationLevel::Orb);

        // Check legacy signal
        assert!(legacy_signal.is_none());
    }

    #[test]
    fn test_preset_serde_tagged_format() {
        let preset = Preset::OrbLegacy(OrbLegacyPreset::new(Some("sig".to_string())));
        let json = serde_json::to_string(&preset).unwrap();

        // Verify tagged format: {"type":"OrbLegacy","data":{"signal":"sig"}}
        assert!(json.contains(r#""type":"OrbLegacy""#));
        assert!(json.contains(r#""data""#));
        assert!(json.contains(r#""signal":"sig""#));

        // Verify roundtrip
        let parsed: Preset = serde_json::from_str(&json).unwrap();
        assert_eq!(preset, parsed);
    }

    #[test]
    fn test_preset_serde_no_signal() {
        let preset = Preset::OrbLegacy(OrbLegacyPreset::new(None));
        let json = serde_json::to_string(&preset).unwrap();

        // Should serialize with null signal
        assert!(json.contains(r#""type":"OrbLegacy""#));

        // Verify roundtrip
        let parsed: Preset = serde_json::from_str(&json).unwrap();
        assert_eq!(preset, parsed);
    }
}
