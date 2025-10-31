//! UniFFI bindings for IDKit
//!
//! This crate generates Swift and Kotlin bindings for the core IDKit library.

use idkit_core::{
    AppId, BridgeUrl, Constraints, ConstraintNode, Credential, Error, Proof, Request, Session,
    SessionConfig, VerificationLevel,
};
use std::sync::Arc;

// Re-export types for UniFFI
pub use idkit_core::bridge::Status;

uniffi::setup_scaffolding!();

/// Initialize the UniFFI library
#[uniffi::export]
fn init() {
    // Initialization logic if needed
}

/// Creates a new AppId
#[uniffi::export]
fn create_app_id(app_id: String) -> Result<Arc<AppId>, String> {
    AppId::new(app_id)
        .map(Arc::new)
        .map_err(|e| e.to_string())
}

/// Creates a new Request
#[uniffi::export]
fn create_request(
    credential_type: Credential,
    signal: String,
    face_auth: Option<bool>,
) -> Arc<Request> {
    let mut request = Request::new(credential_type, signal);
    if let Some(fa) = face_auth {
        request = request.with_face_auth(fa);
    }
    Arc::new(request)
}

/// Creates an "any" constraint (OR logic)
#[uniffi::export]
fn create_any_constraint(credentials: Vec<Credential>) -> Arc<Constraints> {
    Arc::new(Constraints::any(credentials))
}

/// Creates an "all" constraint (AND logic)
#[uniffi::export]
fn create_all_constraint(credentials: Vec<Credential>) -> Arc<Constraints> {
    Arc::new(Constraints::all(credentials))
}

/// Creates a session config from verification level (backward compatibility)
#[uniffi::export]
fn create_session_config_from_verification_level(
    app_id: Arc<AppId>,
    action: String,
    verification_level: VerificationLevel,
    signal: String,
) -> Arc<SessionConfig> {
    Arc::new(SessionConfig::from_verification_level(
        (*app_id).clone(),
        action,
        verification_level,
        signal,
    ))
}

/// Creates a new session config
#[uniffi::export]
fn create_session_config(app_id: Arc<AppId>, action: String) -> Arc<SessionConfig> {
    Arc::new(SessionConfig::new((*app_id).clone(), action))
}

/// Adds a request to a session config
#[uniffi::export]
fn session_config_add_request(
    config: Arc<SessionConfig>,
    request: Arc<Request>,
) -> Arc<SessionConfig> {
    let mut new_config = (*config).clone();
    new_config.requests.push((*request).clone());
    Arc::new(new_config)
}

/// Sets constraints on a session config
#[uniffi::export]
fn session_config_set_constraints(
    config: Arc<SessionConfig>,
    constraints: Arc<Constraints>,
) -> Arc<SessionConfig> {
    let mut new_config = (*config).clone();
    new_config.constraints = Some((*constraints).clone());
    Arc::new(new_config)
}

/// Creates a session
#[uniffi::export(async_runtime = "tokio")]
async fn create_session(config: Arc<SessionConfig>) -> Result<Arc<Session>, String> {
    Session::create((*config).clone())
        .await
        .map(Arc::new)
        .map_err(|e| e.to_string())
}

/// Gets the connect URL for a session
#[uniffi::export]
fn session_connect_url(session: Arc<Session>) -> String {
    session.connect_url()
}

/// Polls a session for status
#[uniffi::export(async_runtime = "tokio")]
async fn session_poll(session: Arc<Session>) -> Result<Status, String> {
    session.poll().await.map_err(|e| e.to_string())
}

/// Waits for a proof from a session
#[uniffi::export(async_runtime = "tokio")]
async fn session_wait_for_proof(session: Arc<Session>) -> Result<Arc<Proof>, String> {
    session
        .wait_for_proof()
        .await
        .map(Arc::new)
        .map_err(|e| e.to_string())
}

/// Verifies a proof using the Developer Portal API
#[uniffi::export(async_runtime = "tokio")]
async fn verify_proof(
    proof: Arc<Proof>,
    app_id: Arc<AppId>,
    action: String,
    signal: String,
) -> Result<(), String> {
    idkit_core::verify_proof((*proof).clone(), &*app_id, &action, signal.as_bytes())
        .await
        .map_err(|e| e.to_string())
}
