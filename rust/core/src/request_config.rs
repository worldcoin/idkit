//! Request-to-bridge mapping shared with the native compatibility oracle.

use crate::{ConstraintNode, Preset, RpContext};
use serde::Deserialize;

/// Shared request configuration used by the JS binding and native conformance runner.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RequestConfig {
    Request {
        app_id: String,
        package_name: String,
        package_version: String,
        action: String,
        rp_context: RpContext,
        action_description: Option<String>,
        bridge_url: Option<String>,
        #[serde(default)]
        allow_legacy_proofs: bool,
        #[serde(default)]
        require_user_presence: bool,
        override_connect_base_url: Option<String>,
        return_to: Option<String>,
        environment: Option<String>,
    },
    CreateSession {
        app_id: String,
        package_name: String,
        package_version: String,
        rp_context: RpContext,
        action_description: Option<String>,
        bridge_url: Option<String>,
        #[serde(default)]
        require_user_presence: bool,
        override_connect_base_url: Option<String>,
        return_to: Option<String>,
        environment: Option<String>,
    },
    ProveSession {
        session_id: String,
        app_id: String,
        package_name: String,
        package_version: String,
        rp_context: RpContext,
        action_description: Option<String>,
        bridge_url: Option<String>,
        #[serde(default)]
        require_user_presence: bool,
        override_connect_base_url: Option<String>,
        return_to: Option<String>,
        environment: Option<String>,
    },
}

impl RequestConfig {
    #[allow(clippy::too_many_lines)]
    pub(crate) fn to_params(
        &self,
        constraints: Option<ConstraintNode>,
    ) -> Result<crate::bridge::BridgeConnectionParams, String> {
        match self {
            Self::Request {
                app_id,
                action,
                rp_context,
                action_description,
                bridge_url,
                allow_legacy_proofs,
                require_user_presence,
                override_connect_base_url,
                return_to,
                environment,
                package_name,
                package_version,
            } => {
                let app_id =
                    crate::AppId::new(app_id).map_err(|e| format!("Invalid app_id: {e}"))?;
                let bridge_url = bridge_url
                    .as_ref()
                    .map(|url| crate::BridgeUrl::new(url, &app_id))
                    .transpose()
                    .map_err(|e| format!("Invalid bridge_url: {e}"))?;

                Ok(crate::bridge::BridgeConnectionParams {
                    app_id,
                    package_name: package_name.clone(),
                    package_version: package_version.clone(),
                    kind: crate::bridge::RequestKind::Uniqueness {
                        action: action.clone(),
                    },
                    constraints,
                    rp_context: rp_context.clone(),
                    action_description: action_description.clone(),
                    // Default to Device for v3 backwards compat — v4 uses proof_request instead.
                    legacy_verification_level: crate::VerificationLevel::Device,
                    legacy_signal: String::new(),
                    bridge_url,
                    allow_legacy_proofs: *allow_legacy_proofs,
                    require_user_presence: *require_user_presence,

                    override_connect_base_url: override_connect_base_url.clone(),
                    return_to: return_to.clone(),
                    environment: environment.as_deref().map(|e| match e {
                        "staging" => crate::bridge::Environment::Staging,
                        "sandbox" => crate::bridge::Environment::Sandbox,
                        _ => crate::bridge::Environment::Production,
                    }),
                    identity_attributes: None,
                })
            }
            Self::CreateSession {
                app_id,
                rp_context,
                action_description,
                bridge_url,
                require_user_presence,
                override_connect_base_url,
                return_to,
                environment,
                package_name,
                package_version,
            } => {
                let app_id =
                    crate::AppId::new(app_id).map_err(|e| format!("Invalid app_id: {e}"))?;
                let bridge_url = bridge_url
                    .as_ref()
                    .map(|url| crate::BridgeUrl::new(url, &app_id))
                    .transpose()
                    .map_err(|e| format!("Invalid bridge_url: {e}"))?;

                Ok(crate::bridge::BridgeConnectionParams {
                    app_id,
                    package_name: package_name.clone(),
                    package_version: package_version.clone(),
                    kind: crate::bridge::RequestKind::CreateSession,
                    constraints,
                    rp_context: rp_context.clone(),
                    action_description: action_description.clone(),
                    // Default to Device for v3 backwards compat — v4 uses proof_request instead.
                    legacy_verification_level: crate::VerificationLevel::Device,
                    legacy_signal: String::new(),
                    bridge_url,
                    allow_legacy_proofs: false,
                    require_user_presence: *require_user_presence,

                    override_connect_base_url: override_connect_base_url.clone(),
                    return_to: return_to.clone(),
                    environment: environment.as_deref().map(|e| match e {
                        "staging" => crate::bridge::Environment::Staging,
                        "sandbox" => crate::bridge::Environment::Sandbox,
                        _ => crate::bridge::Environment::Production,
                    }),
                    identity_attributes: None,
                })
            }
            Self::ProveSession {
                session_id,
                app_id,
                rp_context,
                action_description,
                bridge_url,
                require_user_presence,
                override_connect_base_url,
                return_to,
                environment,
                package_name,
                package_version,
            } => {
                let app_id =
                    crate::AppId::new(app_id).map_err(|e| format!("Invalid app_id: {e}"))?;
                let bridge_url = bridge_url
                    .as_ref()
                    .map(|url| crate::BridgeUrl::new(url, &app_id))
                    .transpose()
                    .map_err(|e| format!("Invalid bridge_url: {e}"))?;

                Ok(crate::bridge::BridgeConnectionParams {
                    app_id,
                    package_name: package_name.clone(),
                    package_version: package_version.clone(),
                    kind: crate::bridge::RequestKind::ProveSession {
                        session_id: session_id.clone(),
                    },
                    constraints,
                    rp_context: rp_context.clone(),
                    action_description: action_description.clone(),
                    // Default to Device for v3 backwards compat — v4 uses proof_request instead.
                    legacy_verification_level: crate::VerificationLevel::Device,
                    legacy_signal: String::new(),
                    bridge_url,
                    allow_legacy_proofs: false,
                    require_user_presence: *require_user_presence,

                    override_connect_base_url: override_connect_base_url.clone(),
                    return_to: return_to.clone(),
                    environment: environment.as_deref().map(|e| match e {
                        "staging" => crate::bridge::Environment::Staging,
                        "sandbox" => crate::bridge::Environment::Sandbox,
                        _ => crate::bridge::Environment::Production,
                    }),
                    identity_attributes: None,
                })
            }
        }
    }

    pub(crate) fn to_params_from_preset(
        &self,
        preset: Preset,
    ) -> Result<crate::bridge::BridgeConnectionParams, String> {
        if matches!(self, Self::CreateSession { .. } | Self::ProveSession { .. }) {
            return Err(
                "Presets are not supported for session flows. Use .constraints() instead."
                    .to_string(),
            );
        }
        let bridge_params = preset.into_bridge_params();
        let mut params = self.to_params(bridge_params.constraints)?;
        params.legacy_verification_level = bridge_params
            .legacy_verification_level
            .unwrap_or(crate::VerificationLevel::Device);
        params.legacy_signal = bridge_params.legacy_signal.unwrap_or_default();
        params.identity_attributes = bridge_params.identity_attributes;
        if let Some(v) = bridge_params.allow_legacy_proofs_override {
            params.allow_legacy_proofs = v;
        }
        Ok(params)
    }
}

pub fn validate_v1_preset_support(preset: &Preset) -> Result<(), &'static str> {
    match preset {
        Preset::SelfieCheck { .. } => {
            return Err(
                "The SelfieCheck preset is not supported by nativePayloadV1FromPreset. Use nativePayloadFromPreset instead.",
            );
        }
        Preset::IdentityCheck { .. } => {
            return Err(
                "IdentityCheck presets are not supported for nativePayloadV1FromPreset. Use nativePayloadFromPreset with a World ID 4.0-compatible client instead.",
            );
        }
        _ => {}
    }

    Ok(())
}
