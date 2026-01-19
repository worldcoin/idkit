//! Request and response types for World ID Protocol 4.0.
//!
//! These types define the structure of proof requests and responses between
//! Relying Parties (RPs) and Authenticators.

use serde::{de::Error as _, Deserialize, Serialize};
use std::collections::HashSet;

use super::constraints::{ConstraintExpr, MAX_CONSTRAINT_NODES};
use super::primitives::{FieldElement, RpId};
use super::proof::WorldIdProof;

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
    /// Current protocol version sets OprfKeyId as the RpId
    pub oprf_key_id: String,
    /// The raw representation of the action (as a field element).
    /// TODO FIXME: Dummy type for now, protocol type expected FieldElement
    pub action: String,
    /// The nullifier key of the RP
    // TODO: Dummy type for now, this will be removed from proof request type
    pub oprf_public_key: String,
    /// The RP's ECDSA signature over the request
    // TODO: Use a real signature type here
    pub signature: String,
    /// Unique nonce for this request
    /// TODO FIXME: Dummy type for now, protocol type expected FieldElement
    pub nonce: String,
    /// Specific credential requests
    #[serde(rename = "proof_requests")]
    pub requests: Vec<RequestItem>,
    /// Constraint expression (all/any) optional
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraints: Option<ConstraintExpr<'static>>,
}

/// Per-credential request payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestItem {
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
    /// If provided, a Session Proof will be generated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<FieldElement>,
}

impl RequestItem {
    /// Create a new request item.
    #[must_use]
    pub fn new(
        identifier: String,
        issuer_schema_id: FieldElement,
        signal: Option<String>,
        genesis_issued_at_min: Option<u64>,
        session_id: Option<FieldElement>,
    ) -> Self {
        Self {
            identifier,
            issuer_schema_id,
            signal,
            genesis_issued_at_min,
            session_id,
        }
    }
}

/// Overall response from the Authenticator to the RP.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProofResponse {
    /// The response id references request id
    pub id: String,
    /// Version corresponding to request version
    pub version: RequestVersion,
    /// Per-credential results
    pub responses: Vec<ResponseItem>,
}

/// Per-credential response item returned by the authenticator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResponseItem {
    /// Credential identifier matching the request.
    pub identifier: String,
    /// Issuer schema id this item refers to
    pub issuer_schema_id: FieldElement,
    /// Proof payload (present if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof: Option<WorldIdProof>,
    /// RP-scoped nullifier (present if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nullifier: Option<FieldElement>,
    /// Optional session identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<FieldElement>,
    /// Present if credential not provided
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ProofResponse {
    /// Determine if constraints are satisfied given a constraint expression.
    #[must_use]
    pub fn constraints_satisfied(&self, constraints: &ConstraintExpr<'_>) -> bool {
        let provided: HashSet<&str> = self
            .responses
            .iter()
            .filter(|item| item.error.is_none())
            .map(|item| item.identifier.as_str())
            .collect();

        constraints.evaluate(&|t| provided.contains(t))
    }

    /// Return the list of successful credential identifiers.
    #[must_use]
    pub fn successful_credentials(&self) -> Vec<&str> {
        self.responses
            .iter()
            .filter(|r| r.error.is_none())
            .map(|r| r.identifier.as_str())
            .collect()
    }

    /// Parse from JSON.
    ///
    /// # Errors
    /// Returns an error if the JSON is invalid.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Serialize to JSON.
    ///
    /// # Errors
    /// Returns an error if serialization fails.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
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

impl ProofRequest {
    /// Validate that a response satisfies this request.
    ///
    /// # Errors
    /// Returns a `ValidationError` if the response doesn't match or satisfy constraints.
    pub fn validate_response(&self, response: &ProofResponse) -> Result<(), ValidationError> {
        if self.id != response.id {
            return Err(ValidationError::RequestIdMismatch);
        }
        if self.version != response.version {
            return Err(ValidationError::VersionMismatch);
        }

        let provided: HashSet<&str> = response
            .responses
            .iter()
            .filter(|r| r.error.is_none())
            .map(|r| r.identifier.as_str())
            .collect();

        match &self.constraints {
            None => {
                for req in &self.requests {
                    if !provided.contains(req.identifier.as_str()) {
                        return Err(ValidationError::MissingCredential(req.identifier.clone()));
                    }
                }
                Ok(())
            }
            Some(expr) => {
                if !expr.validate_max_depth(2) {
                    return Err(ValidationError::ConstraintTooDeep);
                }
                if !expr.validate_max_nodes(MAX_CONSTRAINT_NODES) {
                    return Err(ValidationError::ConstraintTooLarge);
                }
                if expr.evaluate(&|t| provided.contains(t)) {
                    Ok(())
                } else {
                    Err(ValidationError::ConstraintNotSatisfied)
                }
            }
        }
    }

    /// Returns true if the request is expired.
    #[must_use]
    pub const fn is_expired(&self, now: u64) -> bool {
        now > self.expires_at
    }

    /// Parse from JSON.
    ///
    /// # Errors
    /// Returns an error if the JSON is invalid or contains duplicates.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        let v: Self = serde_json::from_str(json)?;
        // Enforce unique issuer schema ids
        let mut seen: HashSet<String> = HashSet::new();
        for r in &v.requests {
            let t = r.issuer_schema_id.to_string();
            if !seen.insert(t.clone()) {
                return Err(serde_json::Error::custom(format!(
                    "duplicate issuer schema id: {t}"
                )));
            }
        }
        Ok(v)
    }

    /// Serialize to JSON.
    ///
    /// # Errors
    /// Returns an error if serialization fails.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
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
        let item = RequestItem {
            identifier: "orb".to_string(),
            issuer_schema_id: FieldElement::from_u64(1),
            signal: Some("test_signal".to_string()),
            genesis_issued_at_min: None,
            session_id: None,
        };

        let json = serde_json::to_string(&item).unwrap();
        let parsed: RequestItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, parsed);
    }

    #[test]
    fn test_response_item_with_proof() {
        let proof_hex = "00".repeat(160);
        let item = ResponseItem {
            identifier: "orb".to_string(),
            issuer_schema_id: FieldElement::from_u64(1),
            proof: Some(WorldIdProof::new(&proof_hex)),
            nullifier: Some(FieldElement::from_u64(12345)),
            session_id: None,
            error: None,
        };

        let json = serde_json::to_string(&item).unwrap();
        let parsed: ResponseItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, parsed);
    }

    #[test]
    fn test_response_item_with_error() {
        let item = ResponseItem {
            identifier: "orb".to_string(),
            issuer_schema_id: FieldElement::from_u64(1),
            proof: None,
            nullifier: None,
            session_id: None,
            error: Some("credential_not_available".to_string()),
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("credential_not_available"));
        assert!(!json.contains("proof"));

        let parsed: ResponseItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, parsed);
    }

    #[test]
    fn test_proof_response_successful_credentials() {
        let response = ProofResponse {
            id: "req_1".to_string(),
            version: RequestVersion::V1,
            responses: vec![
                ResponseItem {
                    identifier: "orb".to_string(),
                    issuer_schema_id: FieldElement::from_u64(1),
                    proof: Some(WorldIdProof::new("00".repeat(160))),
                    nullifier: Some(FieldElement::from_u64(1)),
                    session_id: None,
                    error: None,
                },
                ResponseItem {
                    identifier: "document".to_string(),
                    issuer_schema_id: FieldElement::from_u64(2),
                    proof: None,
                    nullifier: None,
                    session_id: None,
                    error: Some("not_available".to_string()),
                },
            ],
        };

        let successful = response.successful_credentials();
        assert_eq!(successful, vec!["orb"]);
    }
}
