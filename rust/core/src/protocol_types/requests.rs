//! Request and response types for World ID Protocol 4.0.
//!
//! These types define the structure of proof requests and responses between
//! Relying Parties (RPs) and Authenticators.

use alloy_primitives::Signature;
use serde::{Deserialize, Serialize};
use world_id_primitives::rp::RpId;
use world_id_primitives::{FieldElement, ZeroKnowledgeProof};

use super::constraints::ConstraintExpr;

/// Protocol schema version for proof requests and responses.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestVersion {
    /// Version 1
    V1 = 1,
}

impl serde::Serialize for RequestVersion {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> serde::Deserialize<'de> for RequestVersion {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let v = u8::deserialize(deserializer)?;
        match v {
            1 => Ok(Self::V1),
            _ => Err(serde::de::Error::custom("unsupported version")),
        }
    }
}

/// A proof request from a relying party for an authenticator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// TODO: This type is not final, as we wait for the final protocol types to be released
pub struct ProofRequest {
    /// Unique identifier for this request
    pub id: String,
    /// Version of the request
    pub version: RequestVersion,
    /// Unix timestamp (seconds since epoch) when the request was created
    pub created_at: u64,
    /// Unix timestamp (seconds since epoch) when request expires
    pub expires_at: u64,
    /// Registered RP id
    pub rp_id: RpId,
    /// `OprfKeyId` of the RP
    /// Current protocol version sets `OprfKeyId` as the `RpId`
    pub oprf_key_id: String,
    /// The raw representation of the action (as a field element).
    /// Optional for session-only proofs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<FieldElement>,
    /// Session ID for session proofs (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<FieldElement>,
    /// The RP's ECDSA signature over the request
    pub signature: Signature,
    /// Unique nonce for this request
    pub nonce: FieldElement,
    /// Specific credential requests
    #[serde(rename = "proof_requests")]
    pub requests: Vec<CredentialRequest>,
    /// Constraint expression (all/any/enumerate) optional
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraints: Option<ConstraintExpr<'static>>,
    /// Whether to accept legacy (v3) proofs as fallback.
    /// - `true`: Accept both v3 and v4 proofs. Use during migration.
    /// - `false`: Only accept v4 proofs. Use after migration cutoff or for new apps.
    #[serde(default)]
    pub allow_legacy_proofs: bool,
}

impl ProofRequest {
    /// Creates a new proof request.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        created_at: u64,
        expires_at: u64,
        rp_id: RpId,
        action: Option<FieldElement>,
        session_id: Option<FieldElement>,
        signature: Signature,
        nonce: FieldElement,
        requests: Vec<CredentialRequest>,
        constraints: Option<ConstraintExpr<'static>>,
        allow_legacy_proofs: bool,
    ) -> Self {
        let oprf_key_id = rp_id.to_string(); // Current protocol uses RpId as OprfKeyId

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            version: RequestVersion::V1,
            created_at,
            expires_at,
            rp_id,
            oprf_key_id,
            action,
            session_id,
            signature,
            nonce,
            requests,
            constraints,
            allow_legacy_proofs,
        }
    }
}

/// Per-credential request payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CredentialRequest {
    /// An RP-defined identifier for this request item.
    /// Example: `orb`, `document`.
    pub identifier: String,
    /// The specific credential being requested (issuer schema ID as hex).
    pub issuer_schema_id: FieldElement,
    /// Optional RP-defined signal bound into the proof.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<String>,
    /// Optional constraint on minimum genesis issued at timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genesis_issued_at_min: Option<u64>,
    /// Optional constraint on minimum expiration timestamp for the proof.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at_min: Option<u64>,
}

impl CredentialRequest {
    /// Create a new request item.
    #[must_use]
    pub fn new(
        identifier: String,
        issuer_schema_id: FieldElement,
        signal: Option<String>,
        genesis_issued_at_min: Option<u64>,
        expires_at_min: Option<u64>,
    ) -> Self {
        Self {
            identifier,
            issuer_schema_id,
            signal,
            genesis_issued_at_min,
            expires_at_min,
        }
    }
}

/// Overall response from the Authenticator to the RP.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProofResponse {
    /// The response id references request id
    pub id: String,
    /// Version corresponding to request version
    pub version: RequestVersion,
    /// Session ID echoed from request (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<FieldElement>,
    /// Per-credential results
    pub responses: Vec<ResponseItem>,
}

/// Per-credential response item returned by the authenticator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResponseItem {
    /// Credential identifier matching the request.
    pub identifier: String,
    /// Issuer schema id this item refers to
    pub issuer_schema_id: FieldElement,
    /// Proof payload
    pub proof: ZeroKnowledgeProof,
    /// RP-scoped nullifier
    pub nullifier: FieldElement,
    /// Minimum expiration timestamp for the proof
    pub expires_at_min: u64,
}

/// Validation errors when checking a response against a request.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValidationError {
    /// The response `id` does not match the request `id`
    #[error("Request ID mismatch")]
    RequestIdMismatch,
    /// The response `version` does not match the request `version`
    #[error("Version mismatch")]
    VersionMismatch,
    /// A required credential was not provided
    #[error("Missing required credential: {0}")]
    MissingCredential(String),
    /// The provided credentials do not satisfy the request constraints
    #[error("Constraints not satisfied")]
    ConstraintNotSatisfied,
    /// The constraints expression exceeds the supported nesting depth
    #[error("Constraints nesting exceeds maximum allowed depth")]
    ConstraintTooDeep,
    /// The constraints expression exceeds the maximum allowed size
    #[error("Constraints exceed maximum allowed size")]
    ConstraintTooLarge,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_version_serialization() {
        let v = RequestVersion::V1;
        let json = serde_json::to_string(&v).unwrap();
        assert_eq!(json, "1");

        let parsed: RequestVersion = serde_json::from_str(&json).unwrap();
        assert_eq!(v, parsed);
    }

    #[test]
    fn test_request_item_serialization() {
        let item = CredentialRequest {
            identifier: "orb".to_string(),
            issuer_schema_id: FieldElement::from(1_u64),
            signal: Some("test_signal".to_string()),
            genesis_issued_at_min: None,
            expires_at_min: None,
        };

        let json = serde_json::to_string(&item).unwrap();
        let parsed: CredentialRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(item, parsed);
    }

    #[test]
    fn test_response_item_with_proof() {
        let item = ResponseItem {
            identifier: "orb".to_string(),
            issuer_schema_id: FieldElement::from(1_u64),
            proof: ZeroKnowledgeProof::default(),
            nullifier: FieldElement::from(12345_u64),
            expires_at_min: 1_700_000_000,
        };

        let json = serde_json::to_string(&item).unwrap();
        let parsed: ResponseItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, parsed);
    }
}
