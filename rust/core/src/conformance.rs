//! Native-only, deterministic compatibility operations for the JavaScript SDK.
//!
//! This module is excluded from normal SDK builds. It supplies inputs to the
//! production functions; it does not implement a second protocol engine.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use strum::IntoEnumIterator;

use crate::{bridge, crypto, Error, Preset, RpContext, Signal};

/// Stable envelope for failures. Diagnostic prose is useful but not a protocol contract.
#[derive(Debug, Serialize)]
pub struct Failure {
    kind: &'static str,
    message: String,
}

impl From<Error> for Failure {
    fn from(error: Error) -> Self {
        let kind = match &error {
            Error::InvalidConfiguration(_) => "invalid_configuration",
            Error::BridgeError(_) => "bridge_error",
            Error::Json(_) => "json_error",
            Error::Crypto(_) => "crypto_error",
            Error::Base64(_) => "base64_error",
            Error::Url(_) => "url_error",
            Error::AppError(_) => "app_error",
            Error::UnexpectedResponse => "unexpected_response",
            Error::ConnectionFailed => "connection_failed",
            Error::Timeout => "timeout",
            Error::InvalidProof(_) => "invalid_proof",
            Error::Http(_) => "http_error",
        };
        Self {
            kind,
            message: error.to_string(),
        }
    }
}

impl From<serde_json::Error> for Failure {
    fn from(error: serde_json::Error) -> Self {
        Error::Json(error).into()
    }
}

fn invalid(message: impl Into<String>) -> Failure {
    Error::InvalidConfiguration(message.into()).into()
}

fn string<'a>(input: &'a Value, field: &str) -> Result<&'a str, Failure> {
    input
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(format!("{field} must be a string")))
}

fn integer(input: &Value, field: &str) -> Result<u64, Failure> {
    input
        .get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid(format!("{field} must be a u64")))
}

fn bytes(input: &Value, field: &str) -> Result<Vec<u8>, Failure> {
    hex::decode(string(input, field)?).map_err(|error| invalid(format!("{field}: {error}")))
}

fn response_bytes(input: &Value) -> Result<Vec<u8>, Failure> {
    if input.get("response_hex").is_some() {
        return bytes(input, "response_hex");
    }
    Ok(serde_json::to_vec(input.get("response").ok_or_else(
        || invalid("response or response_hex required"),
    )?)?)
}

fn decode<T: serde::de::DeserializeOwned>(input: &Value, field: &str) -> Result<T, Failure> {
    Ok(serde_json::from_value(
        input.get(field).cloned().unwrap_or(Value::Null),
    )?)
}

fn mapped(message: String) -> Failure {
    invalid(message)
}

/// Test-owned state for exercising the real connection parser/connector formatter.
#[derive(Deserialize)]
#[serde(default)]
pub(crate) struct ConnectionContext {
    pub nonce: String,
    pub action: Option<String>,
    pub action_description: Option<String>,
    pub environment: bridge::Environment,
    pub signal_hashes: HashMap<String, String>,
    pub legacy_signal_hash: String,
    pub require_user_presence: bool,
    pub key_hex: String,
    pub request_id: String,
    pub app_id: String,
    pub bridge_url: Option<String>,
    pub override_connect_base_url: Option<String>,
    pub return_to: Option<String>,
    pub invite_code: Option<String>,
}

impl Default for ConnectionContext {
    fn default() -> Self {
        Self {
            nonce: String::new(),
            action: None,
            action_description: None,
            environment: bridge::Environment::Production,
            signal_hashes: HashMap::new(),
            legacy_signal_hash: crypto::hash_signal(&Signal::from_string("")),
            require_user_presence: false,
            key_hex: "00".repeat(32),
            request_id: "test-request".to_string(),
            app_id: "app_test".to_string(),
            bridge_url: None,
            override_connect_base_url: None,
            return_to: None,
            invite_code: None,
        }
    }
}

#[derive(Deserialize)]
struct ConversionContext {
    nonce: String,
    action: Option<String>,
    action_description: Option<String>,
    environment: Option<bridge::Environment>,
    #[serde(default)]
    signal_hashes: HashMap<String, String>,
    identity_attested: Option<bool>,
    user_presence_completed: Option<bool>,
}

fn status_json(status: crate::Status) -> Value {
    match status {
        crate::Status::WaitingForConnection => json!({"type":"waiting_for_connection"}),
        crate::Status::AwaitingConfirmation => json!({"type":"awaiting_confirmation"}),
        crate::Status::Confirmed(result) => json!({"type":"confirmed", "result":result}),
        crate::Status::Failed(error) => json!({"type":"failed", "error":error}),
    }
}

fn request_params(input: &Value, now: u64) -> Result<bridge::BridgeConnectionParams, Failure> {
    let mut config = input
        .get("config")
        .cloned()
        .ok_or_else(|| invalid("config required"))?;
    let context: RpContext = decode(&config, "rp_context")?;
    if now > u64::MAX - 60 {
        return Err(invalid(
            "oracle clock is outside the supported Unix timestamp range",
        ));
    }
    let context = RpContext::new_at(
        context.rp_id,
        context.nonce,
        context.created_at,
        context.expires_at,
        context.signature,
        now,
    )?;
    config["rp_context"] = serde_json::to_value(context)?;
    let config: crate::request_config::RequestConfig = serde_json::from_value(config)?;
    let selection = input
        .get("selection")
        .ok_or_else(|| invalid("selection required"))?;
    let native_v1 = input
        .get("native_v1")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let params = if let Some(preset) = selection.get("preset") {
        let preset: Preset = serde_json::from_value(preset.clone())?;
        if native_v1 {
            crate::request_config::validate_v1_preset_support(&preset).map_err(invalid)?;
        }
        config.to_params_from_preset(preset).map_err(mapped)?
    } else {
        if native_v1 {
            return Err(invalid("native_v1 requires a preset"));
        }
        config
            .to_params(Some(decode(selection, "constraints")?))
            .map_err(mapped)?
    };
    Ok(params)
}

fn compile(input: &Value) -> Result<Value, Failure> {
    let params = request_params(input, integer(input, "now")?)?;
    let payload = if input
        .get("native_v1")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        bridge::build_native_v1_payload(&params)?
    } else {
        bridge::conformance_request_payload(
            &params,
            input
                .get("native")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            string(input, "request_id")?,
        )?
    };
    let cached = bridge::CachedSignalHashes::compute(&params);
    Ok(json!({
        "payload":payload,
        "signal_hashes":cached.signal_hashes,
        "legacy_signal_hash":cached.legacy_signal_hash,
    }))
}

fn create_connection(
    input: &Value,
) -> Result<(tokio::runtime::Runtime, bridge::BridgeConnection), Failure> {
    let now = if input.get("now").is_some() {
        integer(input, "now")?
    } else {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| invalid(error.to_string()))?
            .as_secs()
    };
    let params = request_params(input, now)?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| invalid(format!("Failed to create oracle runtime: {error}")))?;
    let connection = if input
        .get("invite_code")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        runtime.block_on(bridge::BridgeConnection::create_for_invite_code(params))?
    } else {
        runtime.block_on(bridge::BridgeConnection::create(params))?
    };
    Ok((runtime, connection))
}

fn connection_json(connection: &bridge::BridgeConnection) -> Value {
    let mut result = json!({
        "connector_uri":connection.connect_url(),
        "request_id":connection.request_id(),
        "debug_report":connection.get_debug_report(),
    });
    if let Some(expires_at) = connection.code_expires_at() {
        result["expires_at"] = json!(expires_at);
    }
    result
}

fn create(input: &Value) -> Result<Value, Failure> {
    let (_runtime, connection) = create_connection(input)?;
    Ok(connection_json(&connection))
}

fn full_response_shape(mut response: crate::ResponseItem) -> Result<Value, Failure> {
    use crate::ResponseItem;
    // Enumerate every field so additions cannot silently bypass the shape gate.
    match &mut response {
        ResponseItem::SelfieV4 {
            identifier: _,
            signal_hash,
            issuer_schema_id: _,
            proof,
            nullifier: _,
            expires_at_min: _,
            sybil_score: _,
        }
        | ResponseItem::V4 {
            identifier: _,
            signal_hash,
            issuer_schema_id: _,
            proof,
            nullifier: _,
            expires_at_min: _,
        } => {
            *signal_hash = Some("signal_hash".to_string());
            *proof = ["1", "2", "3", "4", "5"].map(str::to_owned).to_vec();
        }
        ResponseItem::SelfieSession {
            identifier: _,
            signal_hash,
            issuer_schema_id: _,
            proof,
            session_nullifier,
            expires_at_min: _,
            sybil_score: _,
        }
        | ResponseItem::Session {
            identifier: _,
            signal_hash,
            issuer_schema_id: _,
            proof,
            session_nullifier,
            expires_at_min: _,
        } => {
            *signal_hash = Some("signal_hash".to_string());
            *proof = ["1", "2", "3", "4", "5"].map(str::to_owned).to_vec();
            *session_nullifier = ["1", "2"].map(str::to_owned).to_vec();
        }
        ResponseItem::V3 {
            identifier: _,
            signal_hash: _,
            proof: _,
            merkle_root: _,
            nullifier: _,
        } => {}
    }
    // Populating the typed vectors before serialization checks both the field
    // names and their element types; rewriting serialized JSON would hide drift.
    Ok(serde_json::to_value(response)?)
}

fn manifest() -> Result<Value, Failure> {
    let protocol_version = include_str!("../../../Cargo.lock")
        .split("[[package]]")
        .find(|package| {
            package
                .lines()
                .any(|line| line == "name = \"world-id-primitives\"")
        })
        .and_then(|package| {
            package
                .lines()
                .find_map(|line| line.strip_prefix("version = \""))
        })
        .and_then(|version| version.strip_suffix('"'))
        .ok_or_else(|| invalid("world-id-primitives version missing from Cargo.lock"))?;
    let credentials: serde_json::Map<String, Value> = crate::CredentialType::iter()
        .map(|credential| (credential.to_string(), json!(credential.issuer_schema_id())))
        .collect();
    let presets = Preset::iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()?;
    let response_shapes = crate::ResponseItem::iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()?;
    let full_response_shapes = crate::ResponseItem::iter()
        .map(full_response_shape)
        .collect::<Result<Vec<_>, _>>()?;
    // Explicit fields make DTO additions require an intentional fixture update.
    let full_result = crate::IDKitResult {
        protocol_version: "4.0".to_string(),
        nonce: "nonce".to_string(),
        action: Some("action".to_string()),
        action_description: Some("description".to_string()),
        session_id: Some("session".to_string()),
        responses: Vec::new(),
        user_presence_completed: Some(true),
        environment: "production".to_string(),
        identity_attested: Some(true),
        integrity_bundle: Some(crate::IntegrityBundle {
            version: 1,
            signature_format: crate::IntegritySignatureFormat::AppleAppAttest,
            timestamp: 1,
            signature: "signature".to_string(),
            jwt: "jwt".to_string(),
        }),
    };
    Ok(json!({
        "format_version":1,
        "rust_core_version":env!("CARGO_PKG_VERSION"),
        "protocol_version":protocol_version,
        "request_versions":[world_id_primitives::RequestVersion::V1],
        "credentials":credentials,
        "presets":presets,
        "error_codes":crate::error::AppError::iter().collect::<Vec<_>>(),
        "environments":bridge::Environment::iter().collect::<Vec<_>>(),
        "verification_levels":crate::VerificationLevel::iter().collect::<Vec<_>>(),
        "document_types":crate::types::DocumentType::iter().collect::<Vec<_>>(),
        "integrity_signature_formats":crate::IntegritySignatureFormat::iter().collect::<Vec<_>>(),
        "response_shapes":response_shapes,
        "response_shapes_full":full_response_shapes,
        "result_shapes": [crate::IDKitResult::new("4.0", "nonce", None, None, vec![], None, "production"), full_result],
    }))
}

/// Runs one deterministic operation. See the binary README for the JSONL contract.
///
/// # Errors
/// Returns a structured failure for invalid inputs or a production operation failure.
#[allow(clippy::too_many_lines)] // Keep the small operation adapters together for contract review.
pub fn execute(input: &Value) -> Result<Value, Failure> {
    match string(input, "op")? {
        "manifest" => manifest(),
        "hash_signal" => {
            let signal = input
                .get("signal")
                .ok_or_else(|| invalid("signal required"))?;
            let signal = if let Some(text) = signal.as_str() {
                Signal::from_string(text)
            } else {
                Signal::from_bytes(bytes(signal, "bytes_hex")?)
            };
            Ok(json!(crypto::hash_signal(&signal)))
        }
        "hash_to_field" => Ok(json!(format!(
            "{:#066x}",
            crypto::hash_to_field(&bytes(input, "input_hex")?)
        ))),
        "encrypt" => Ok(json!({"ciphertext_hex":hex::encode(crypto::encrypt(
            &bytes(input, "key_hex")?, &bytes(input, "iv_hex")?, &bytes(input, "plaintext_hex")?,
        )?)})),
        "decrypt" => Ok(json!({"plaintext_hex":hex::encode(crypto::decrypt(
            &bytes(input, "key_hex")?, &bytes(input, "iv_hex")?, &bytes(input, "ciphertext_hex")?,
        )?)})),
        "base64_encode" => Ok(json!(crypto::base64_encode(&bytes(input, "input_hex")?))),
        "base64_decode" => {
            Ok(json!({"bytes_hex":hex::encode(crypto::base64_decode(string(input, "value")?)?)}))
        }
        "invite_derive" => {
            let code = string(input, "code")?;
            Ok(
                json!({"index":crypto::hkdf_invite_index_hex(code), "key_hex":hex::encode(crypto::hkdf_invite_key(code))}),
            )
        }
        "invite_parse" => {
            let code = crypto::invite_code::parse_invite_code(string(input, "code")?)
                .map_err(|error| invalid(format!("{error:?}")))?;
            Ok(json!(code))
        }
        "invite_generate" => {
            let entropy: [u8; 5] = bytes(input, "entropy_hex")?
                .try_into()
                .map_err(|_| invalid("invite code entropy must be 5 bytes"))?;
            Ok(json!(crypto::invite_code::code_from_entropy(entropy)))
        }
        "constraints" => {
            let constraints: crate::ConstraintNode = decode(input, "constraints")?;
            constraints.validate()?;
            let (requests, expression) = constraints.to_protocol_top_level()?;
            Ok(json!({"proof_requests":requests, "constraints":expression}))
        }
        "compile" => compile(input),
        "create" => create(input),
        "response" => {
            let context = input.get("context").cloned().unwrap_or_else(|| json!({}));
            let connection = bridge::conformance_connection(serde_json::from_value(context)?)?;
            Ok(status_json(
                connection.handle_decrypted_response(&response_bytes(input)?)?,
            ))
        }
        "poll" => {
            let context = input.get("context").cloned().unwrap_or_else(|| json!({}));
            let connection = bridge::conformance_connection(serde_json::from_value(context)?)?;
            Ok(status_json(
                connection.conformance_poll_response(&response_bytes(input)?)?,
            ))
        }
        "proof_response" => {
            let context: ConversionContext = decode(input, "context")?;
            let response = decode(input, "response")?;
            Ok(serde_json::to_value(
                bridge::proof_response_with_claims_to_idkit_result(
                    response,
                    bridge::ProofResponseConversionContext {
                        nonce: context.nonce,
                        action: context.action,
                        action_description: context.action_description,
                        environment: context.environment,
                        signal_hashes: &context.signal_hashes,
                        identity_attested: context.identity_attested,
                        user_presence_completed: context.user_presence_completed,
                    },
                )?,
            )?)
        }
        "connect_url" => {
            let context = input.get("context").cloned().unwrap_or_else(|| json!({}));
            Ok(json!(bridge::conformance_connection(
                serde_json::from_value(context)?
            )?
            .connect_url()))
        }
        "app_error" => Ok(json!(crate::error::AppError::from_code(string(
            input, "code"
        )?))),
        "bridge_url" => {
            let app_id = crate::AppId::new(string(input, "app_id")?)?;
            Ok(json!(crate::BridgeUrl::new(
                string(input, "url")?,
                &app_id
            )?
            .as_str()))
        }
        "signature_message" | "sign" => {
            use world_id_primitives::FieldElement;
            let nonce = string(input, "nonce")?
                .parse::<FieldElement>()
                .map_err(|error| invalid(error.to_string()))?;
            let created_at = integer(input, "created_at")?;
            let expires_at = integer(input, "expires_at")?;
            let action = input
                .get("action")
                .and_then(Value::as_str)
                .map(|action| FieldElement::from_arbitrary_raw_bytes(action.as_bytes()));
            if string(input, "op")? == "signature_message" {
                Ok(
                    json!({"message_hex":hex::encode(world_id_primitives::rp::compute_rp_signature_msg(
                        *nonce, created_at, expires_at, action.map(|action| *action),
                    ))}),
                )
            } else {
                let key = bytes(input, "key_hex")?;
                let key = k256::ecdsa::SigningKey::from_slice(&key)
                    .map_err(|error| invalid(error.to_string()))?;
                let signature = crate::rp_signature::sign_rp_message(
                    &key, nonce, created_at, expires_at, action,
                )?;
                Ok(
                    json!({"sig":signature.sig,"nonce":signature.nonce,"created_at":signature.created_at,"expires_at":signature.expires_at}),
                )
            }
        }
        operation => Err(invalid(format!("Unknown operation: {operation}"))),
    }
}

/// Tags integers outside JavaScript's exact range before JSON crosses the process boundary.
pub fn encode_wide_integers(value: &mut Value) {
    const MAX_SAFE: u64 = 9_007_199_254_740_991;
    match value {
        Value::Number(number) => {
            if let Some(integer) = number.as_u64().filter(|integer| *integer > MAX_SAFE) {
                *value = json!({"$u64":integer.to_string()});
            } else if let Some(integer) = number
                .as_i64()
                .filter(|integer| *integer < -9_007_199_254_740_991)
            {
                *value = json!({"$i64":integer.to_string()});
            }
        }
        Value::Array(array) => array.iter_mut().for_each(encode_wide_integers),
        Value::Object(object) => object.values_mut().for_each(encode_wide_integers),
        _ => {}
    }
}

/// Accepts tagged integers in the oracle input without lossy JavaScript number conversion.
///
/// # Errors
/// Returns a structured failure for a malformed tag or integer outside its declared range.
pub fn decode_wide_integers(value: &mut Value) -> Result<(), Failure> {
    match value {
        Value::Object(object) if object.len() == 1 && object.contains_key("$u64") => {
            let integer = object["$u64"]
                .as_str()
                .ok_or_else(|| invalid("$u64 must contain a decimal string"))?
                .parse::<u64>()
                .map_err(|error| invalid(error.to_string()))?;
            *value = json!(integer);
        }
        Value::Object(object) if object.len() == 1 && object.contains_key("$i64") => {
            let integer = object["$i64"]
                .as_str()
                .ok_or_else(|| invalid("$i64 must contain a decimal string"))?
                .parse::<i64>()
                .map_err(|error| invalid(error.to_string()))?;
            *value = json!(integer);
        }
        Value::Object(object) => {
            for child in object.values_mut() {
                decode_wide_integers(child)?;
            }
        }
        Value::Array(array) => {
            for child in array {
                decode_wide_integers(child)?;
            }
        }
        _ => {}
    }
    Ok(())
}

/// Processes one input line, including parsing errors, without terminating the stream.
#[must_use]
pub fn process_line(line: &str) -> Value {
    Runner::default().process_line(line)
}

/// Test-only JSONL session. Retains the actual created connection so HTTP
/// transcripts can exercise creation and polling without reconstructing state.
#[derive(Default)]
pub struct Runner {
    connection: Option<(tokio::runtime::Runtime, bridge::BridgeConnection)>,
}

impl Runner {
    /// Executes a line; `create_live` starts/replaces the session and `poll_live`
    /// polls it. All other operations retain the stateless oracle contract.
    #[must_use]
    pub fn process_line(&mut self, line: &str) -> Value {
        let result = serde_json::from_str::<Value>(line)
        .map_err(Failure::from)
        .and_then(|mut input| {
            decode_wide_integers(&mut input)?;
            match string(&input, "op")? {
                "create_live" => {
                    self.connection = None;
                    let connection = create_connection(&input)?;
                    let output = connection_json(&connection.1);
                    self.connection = Some(connection);
                    Ok(output)
                }
                "poll_live" => {
                    let (runtime, connection) = self.connection.as_ref()
                        .ok_or_else(|| invalid("create_live is required before poll_live"))?;
                    let status = runtime.block_on(connection.poll_for_status())?;
                    Ok(json!({"status":status_json(status), "debug_report":connection.get_debug_report()}))
                }
                _ => execute(&input),
            }
        });
        let mut output = match result {
            Ok(value) => json!({"ok":true, "value":value}),
            Err(error) => json!({"ok":false, "error":error}),
        };
        encode_wide_integers(&mut output);
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile_input() -> Value {
        json!({
            "op":"compile", "now":1_700_000_000, "request_id":"fixed-proof-request",
            "config":{
                "kind":"request", "app_id":"app_test", "action":"0x1234",
                "package_name":"idkit-core", "package_version":"test",
                "allow_legacy_proofs":true,
                "rp_context":{
                    "rp_id":"rp_1", "nonce":format!("0x{}", "00".repeat(32)),
                    "created_at":1_700_000_000, "expires_at":1_700_000_300,
                    "signature":format!("0x{}1b", "00".repeat(64)),
                },
            },
            "selection":{"preset":{"type":"SelfieCheck", "signal":"0x"}},
        })
    }

    #[test]
    fn compiler_uses_real_preset_rules_and_explicit_request_id() {
        let input = compile_input();
        let first = execute(&input).unwrap();
        assert_eq!(first, execute(&input).unwrap());
        assert_eq!(
            first["payload"]["proof_request"]["id"],
            "fixed-proof-request"
        );
        assert_eq!(first["payload"]["allow_legacy_proofs"], false);
        assert_eq!(first["payload"]["verification_level"], "device");
        assert_eq!(
            first["payload"]["proof_request"]["rp_id"],
            "rp_0000000000000001"
        );
        assert_eq!(
            first["signal_hashes"]["selfie"],
            crypto::hash_signal(&Signal::from_string("0x"))
        );
    }

    #[test]
    fn serialized_empty_bytes_and_text_signals_remain_distinct() {
        let mut input = compile_input();
        let preset = execute(&input).unwrap();
        input["selection"] = json!({"constraints":{"type":"selfie", "signal":"0x"}});
        let constraint = execute(&input).unwrap();
        assert_ne!(preset["signal_hashes"], constraint["signal_hashes"]);
        assert_eq!(
            constraint["signal_hashes"]["selfie"],
            crypto::hash_signal(&Signal::from_bytes(vec![]))
        );
    }

    #[test]
    fn explicit_clock_tests_the_production_skew_boundary() {
        let mut input = compile_input();
        input["config"]["rp_context"]["created_at"] = json!(1_700_000_060);
        assert!(execute(&input).is_ok());
        input["config"]["rp_context"]["created_at"] = json!(1_700_000_061);
        assert_eq!(execute(&input).unwrap_err().kind, "invalid_configuration");
    }

    #[test]
    fn response_preserves_protocol_error_precedence() {
        let input = json!({
            "op":"response", "context":{"require_user_presence":true},
            "response":{"id":"proof-request", "version":1, "error":"nullifier_replay", "responses":[]},
        });
        assert_eq!(
            execute(&input).unwrap(),
            json!({"type":"failed", "error":"nullifier_replayed"})
        );
    }

    #[test]
    fn poll_uses_response_iv_and_authenticates_before_parsing() {
        let plaintext = serde_json::to_vec(&json!({"error_code":"user_rejected"})).unwrap();
        let iv = [7; 12];
        let mut ciphertext = crypto::encrypt(&[0; 32], &iv, &plaintext).unwrap();
        let mut input = json!({
            "op":"poll", "response":{"status":"completed", "response":{
                "iv":crypto::base64_encode(&iv), "payload":crypto::base64_encode(&ciphertext),
            }},
        });
        assert_eq!(
            execute(&input).unwrap(),
            json!({"type":"failed", "error":"user_rejected"})
        );
        ciphertext[0] ^= 1;
        input["response"]["response"]["payload"] = json!(crypto::base64_encode(&ciphertext));
        assert_eq!(execute(&input).unwrap_err().kind, "crypto_error");
    }

    #[test]
    fn raw_poll_preserves_duplicate_fields_and_ignored_value_rules() {
        let duplicate = json!({
            "op":"poll", "response_hex":hex::encode(
                br#"{"status":"initialized","status":"retrieved"}"#,
            ),
        });
        assert_eq!(execute(&duplicate).unwrap_err().kind, "json_error");
        let ignored = json!({
            "op":"poll", "response_hex":hex::encode(
                br#"{"status":"initialized","future":"\ud800","future":true}"#,
            ),
        });
        assert_eq!(
            execute(&ignored).unwrap(),
            json!({"type":"waiting_for_connection"}),
        );
    }

    #[test]
    fn raw_decrypted_response_retains_untagged_variant_fallback() {
        let mut input = json!({
            "op":"response", "response_hex":hex::encode(
                br#"{"error_code":"user_rejected","error_code":"generic_error"}"#,
            ),
        });
        assert_eq!(execute(&input).unwrap_err().kind, "json_error");
        input["response_hex"] = json!(hex::encode(
            br#"{"error_code":"user_rejected","error_code":"generic_error","verification_level":"orb","proof":"0x01","merkle_root":"0x02","nullifier_hash":"0x03"}"#,
        ));
        assert_eq!(execute(&input).unwrap()["type"], "confirmed");
    }

    #[test]
    fn wide_integer_envelope_roundtrips_without_precision_loss() {
        let original = json!({"u64":u64::MAX,"i64":i64::MIN,"safe":9_007_199_254_740_991_u64});
        let mut encoded = original.clone();
        encode_wide_integers(&mut encoded);
        assert_eq!(encoded["u64"]["$u64"], u64::MAX.to_string());
        assert_eq!(encoded["safe"], original["safe"]);
        decode_wide_integers(&mut encoded).unwrap();
        assert_eq!(encoded, original);
    }

    #[test]
    fn malformed_input_returns_an_error_envelope() {
        assert_eq!(process_line("{")["error"]["kind"], "json_error");
        assert_eq!(
            process_line(r#"{"op":"hash_to_field","input_hex":""}"#)["ok"],
            true
        );
    }

    #[test]
    fn manifest_contains_every_iterable_variant_and_actual_schema_ids() {
        let value = manifest().unwrap();
        assert_eq!(value["credentials"]["selfie"], 11);
        assert_eq!(
            value["presets"].as_array().unwrap().len(),
            Preset::iter().count()
        );
        assert_eq!(
            value["response_shapes"].as_array().unwrap().len(),
            crate::ResponseItem::iter().count()
        );
        assert!(value["result_shapes"][0].get("integrity_bundle").is_none());
        assert!(value["result_shapes"][1].get("integrity_bundle").is_some());
    }
}
