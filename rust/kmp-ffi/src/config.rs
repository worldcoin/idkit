//! Config DTOs mirrored by the Kotlin commonMain layer.
//!
//! These are ports of the request arm of core's `IDKitConfig::to_params` /
//! `to_params_from_preset` (see `rust/core/src/bridge.rs`), decoded from JSON
//! produced by `IDKitRequestConfig.toConfigJson()` in Kotlin.

use serde::Deserialize;

use idkit::bridge::{BridgeConnectionParams, Environment, RequestKind};
use idkit::types::{AppId, BridgeUrl, IdentityAttribute, RpContext, VerificationLevel};
use idkit::{ConstraintNode, Preset};

use crate::envelope::FfiError;

#[derive(Debug, Deserialize)]
pub(crate) struct RpContextDto {
    rp_id: String,
    nonce: String,
    /// Unix seconds
    created_at: u64,
    /// Unix seconds
    expires_at: u64,
    signature: String,
}

impl RpContextDto {
    /// Goes through the validating constructor (rp_ prefix, clock skew,
    /// expiry ordering) rather than deserializing the core type directly.
    fn into_rp_context(self) -> Result<RpContext, FfiError> {
        RpContext::new(
            &self.rp_id,
            self.nonce,
            self.created_at,
            self.expires_at,
            self.signature,
        )
        .map_err(FfiError::Core)
    }
}

/// Mirror of core's `ConnectUrlMode`, which is gated behind the `ffi` feature.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ConnectUrlMode {
    #[default]
    Default,
    AppClip,
}

impl ConnectUrlMode {
    /// Applies the mode to a raw connect URL. App Clip mode wraps it in an
    /// Apple App Clip invocation URL, byte-for-byte like the `UniFFI` wrapper.
    pub(crate) fn apply(self, url: String) -> String {
        match self {
            Self::Default => url,
            Self::AppClip => {
                let encoded = idkit::crypto::base64_url_encode(url.as_bytes());
                format!(
                    "https://appclip.apple.com/id?p=org.worldcoin.insight.Clip&experience={encoded}"
                )
            }
        }
    }
}

/// JSON schema for the request configuration produced by Kotlin commonMain.
///
/// `deny_unknown_fields` keeps the Kotlin and Rust sides honest: a field-name
/// drift fails loudly at the boundary instead of being silently dropped.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RequestConfigDto {
    app_id: String,
    package_name: String,
    package_version: String,
    action: String,
    rp_context: RpContextDto,
    #[serde(default)]
    action_description: Option<String>,
    #[serde(default)]
    bridge_url: Option<String>,
    allow_legacy_proofs: bool,
    #[serde(default)]
    require_user_presence: Option<bool>,
    #[serde(default)]
    override_connect_base_url: Option<String>,
    #[serde(default)]
    return_to: Option<String>,
    #[serde(default)]
    environment: Option<Environment>,
    #[serde(default)]
    connect_url_mode: Option<ConnectUrlMode>,
}

impl RequestConfigDto {
    pub(crate) fn connect_url_mode(&self) -> ConnectUrlMode {
        self.connect_url_mode.unwrap_or_default()
    }

    /// Port of core's `IDKitConfig::to_params` (Request arm).
    pub(crate) fn into_params_with_constraints(
        self,
        constraints: ConstraintNode,
    ) -> Result<BridgeConnectionParams, FfiError> {
        constraints.validate().map_err(FfiError::Core)?;
        // Device keeps the payload parseable by pre-4.0 World App versions;
        // v4 requests carry real credential selection in `proof_request`.
        self.into_params(
            Some(constraints),
            VerificationLevel::Device,
            String::new(),
            None,
            None,
        )
    }

    /// Port of core's `IDKitConfig::to_params_from_preset` (Request arm).
    pub(crate) fn into_params_with_preset(
        self,
        preset: Preset,
    ) -> Result<BridgeConnectionParams, FfiError> {
        let bridge_params = preset.into_bridge_params();
        let legacy_verification_level = bridge_params
            .legacy_verification_level
            .unwrap_or(VerificationLevel::Device);
        self.into_params(
            bridge_params.constraints,
            legacy_verification_level,
            bridge_params.legacy_signal.unwrap_or_default(),
            bridge_params.identity_attributes,
            bridge_params.allow_legacy_proofs_override,
        )
    }

    fn into_params(
        self,
        constraints: Option<ConstraintNode>,
        legacy_verification_level: VerificationLevel,
        legacy_signal: String,
        identity_attributes: Option<Vec<IdentityAttribute>>,
        allow_legacy_proofs_override: Option<bool>,
    ) -> Result<BridgeConnectionParams, FfiError> {
        let app_id = AppId::new(self.app_id).map_err(FfiError::Core)?;
        let bridge_url = self
            .bridge_url
            .map(|url| BridgeUrl::new(url, &app_id))
            .transpose()
            .map_err(FfiError::Core)?;
        Ok(BridgeConnectionParams {
            app_id,
            package_name: self.package_name,
            package_version: self.package_version,
            kind: RequestKind::Uniqueness {
                action: self.action,
            },
            constraints,
            rp_context: self.rp_context.into_rp_context()?,
            action_description: self.action_description,
            legacy_verification_level,
            legacy_signal,
            bridge_url,
            allow_legacy_proofs: allow_legacy_proofs_override.unwrap_or(self.allow_legacy_proofs),
            require_user_presence: self.require_user_presence.unwrap_or(false),
            override_connect_base_url: self.override_connect_base_url,
            return_to: self.return_to,
            environment: self.environment,
            identity_attributes,
        })
    }
}
