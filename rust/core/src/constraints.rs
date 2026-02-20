//! Constraint system for declarative credential requests
//!
//! This module provides a wrapper layer that:
//! - Uses `CredentialRequest` for the public API (type-safe)
//! - Converts to/from `protocol_types::ConstraintExpr` internally
//! - Provides FFI/WASM bindings
//!
//! The underlying protocol types use string identifiers and lifetimes,
//! which allows them to be decoupled (potentially replaced by an external crate).

use crate::protocol_types::{
    ConstraintExpr as ProtocolExpr, ConstraintNode as ProtocolNode,
    CredentialRequest as ProtocolCredentialRequest,
};
use crate::types::{CredentialRequest, CredentialType};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashSet;

#[cfg(feature = "ffi")]
use std::sync::Arc;

/// A node in the constraint tree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ffi", derive(uniffi::Object))]
#[serde(untagged)]
pub enum ConstraintNode {
    /// A leaf node representing a single credential request item
    Item(CredentialRequest),

    /// An OR node - at least one child must be satisfied
    /// Order matters: earlier credentials have higher priority
    Any {
        /// Child constraints (priority ordered)
        any: Vec<Self>,
    },

    /// An AND node - all children must be satisfied
    All {
        /// Child constraints (all required)
        all: Vec<Self>,
    },

    /// An enumerate node - all satisfiable children should be selected
    Enumerate {
        /// Child constraints to evaluate and include when satisfied
        enumerate: Vec<Self>,
    },
}

impl ConstraintNode {
    /// Creates an Any constraint from nodes
    #[must_use]
    pub fn any(nodes: Vec<Self>) -> Self {
        Self::Any { any: nodes }
    }

    /// Creates an All constraint from nodes
    #[must_use]
    pub fn all(nodes: Vec<Self>) -> Self {
        Self::All { all: nodes }
    }

    /// Creates an enumerate constraint from nodes
    #[must_use]
    pub fn enumerate(nodes: Vec<Self>) -> Self {
        Self::Enumerate { enumerate: nodes }
    }

    /// Creates an item node from a `CredentialRequest`
    #[must_use]
    pub fn item(request: CredentialRequest) -> Self {
        Self::Item(request)
    }

    /// Evaluates the constraint against available credentials
    #[must_use]
    pub fn evaluate(&self, available: &HashSet<CredentialType>) -> bool {
        match self {
            Self::Item(item) => available.contains(&item.credential_type),
            Self::Any { any } => any.iter().any(|node| node.evaluate(available)),
            Self::All { all } => all.iter().all(|node| node.evaluate(available)),
            Self::Enumerate { enumerate } => enumerate.iter().any(|node| node.evaluate(available)),
        }
    }

    /// Returns the first satisfying credential type in priority order
    ///
    /// For Any nodes, returns the first child that evaluates to true.
    /// For All nodes, returns None if not all satisfied, or attempts to find a single credential.
    /// For Enumerate nodes, returns the first satisfiable child in evaluation order.
    /// For Item nodes, returns the credential type if available.
    #[must_use]
    pub fn first_satisfying(&self, available: &HashSet<CredentialType>) -> Option<CredentialType> {
        match self {
            Self::Item(item) => {
                if available.contains(&item.credential_type) {
                    Some(item.credential_type)
                } else {
                    None
                }
            }
            Self::Any { any } => {
                // Return the first credential that satisfies (priority order)
                for node in any {
                    if let Some(cred) = node.first_satisfying(available) {
                        return Some(cred);
                    }
                }
                None
            }
            Self::All { all } => {
                // For ALL, we need all to be satisfied
                // Return the first credential found if all are satisfied
                if !self.evaluate(available) {
                    return None;
                }

                // Find the first concrete credential
                for node in all {
                    if let Some(cred) = node.first_satisfying(available) {
                        return Some(cred);
                    }
                }
                None
            }
            Self::Enumerate { enumerate } => {
                // Return the first satisfiable credential in evaluation order.
                for node in enumerate {
                    if let Some(cred) = node.first_satisfying(available) {
                        return Some(cred);
                    }
                }
                None
            }
        }
    }

    /// Collects all credential types mentioned in this constraint tree
    #[must_use]
    pub fn collect_credential_types(&self) -> HashSet<CredentialType> {
        let mut result = HashSet::new();
        self.collect_credential_types_recursive(&mut result);
        result
    }

    fn collect_credential_types_recursive(&self, result: &mut HashSet<CredentialType>) {
        match self {
            Self::Item(item) => {
                result.insert(item.credential_type);
            }
            Self::Any { any } => {
                for node in any {
                    node.collect_credential_types_recursive(result);
                }
            }
            Self::All { all } => {
                for node in all {
                    node.collect_credential_types_recursive(result);
                }
            }
            Self::Enumerate { enumerate } => {
                for node in enumerate {
                    node.collect_credential_types_recursive(result);
                }
            }
        }
    }

    /// Collects all `CredentialRequest`s from this constraint tree
    #[must_use]
    pub fn collect_items(&self) -> Vec<&CredentialRequest> {
        match self {
            Self::Item(item) => vec![item],
            Self::Any { any } => any.iter().flat_map(Self::collect_items).collect(),
            Self::All { all } => all.iter().flat_map(Self::collect_items).collect(),
            Self::Enumerate { enumerate } => {
                enumerate.iter().flat_map(Self::collect_items).collect()
            }
        }
    }

    /// Validates the constraint tree structure
    ///
    /// # Errors
    ///
    /// Returns an error if the tree is invalid (e.g., empty Any/All/Enumerate nodes)
    pub fn validate(&self) -> crate::Result<()> {
        match self {
            Self::Item(_) => Ok(()),
            Self::Any { any } => {
                if any.is_empty() {
                    return Err(crate::Error::InvalidConfiguration(
                        "Any constraint must have at least one child".to_string(),
                    ));
                }
                for node in any {
                    node.validate()?;
                }
                Ok(())
            }
            Self::All { all } => {
                if all.is_empty() {
                    return Err(crate::Error::InvalidConfiguration(
                        "All constraint must have at least one child".to_string(),
                    ));
                }
                for node in all {
                    node.validate()?;
                }
                Ok(())
            }
            Self::Enumerate { enumerate } => {
                if enumerate.is_empty() {
                    return Err(crate::Error::InvalidConfiguration(
                        "Enumerate constraint must have at least one child".to_string(),
                    ));
                }
                for node in enumerate {
                    node.validate()?;
                }
                Ok(())
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Protocol conversion methods
    // ─────────────────────────────────────────────────────────────────────────

    /// Converts this node to a protocol constraint node (expression form)
    fn to_protocol_node(&self) -> ProtocolNode<'static> {
        match self {
            Self::Item(item) => {
                ProtocolNode::Type(Cow::Owned(item.credential_type.as_str().to_string()))
            }
            Self::Any { any } => ProtocolNode::Expr(ProtocolExpr::Any {
                any: any.iter().map(Self::to_protocol_node).collect(),
            }),
            Self::All { all } => ProtocolNode::Expr(ProtocolExpr::All {
                all: all.iter().map(Self::to_protocol_node).collect(),
            }),
            Self::Enumerate { enumerate } => ProtocolNode::Expr(ProtocolExpr::Enumerate {
                enumerate: enumerate.iter().map(Self::to_protocol_node).collect(),
            }),
        }
    }

    /// Converts constraint tree to protocol types
    ///
    /// Returns (`request_items`, `constraint_expression`) tuple.
    /// The constraint expression is always wrapped at the top level.
    ///
    /// # Errors
    ///
    /// Returns an error if any `CredentialRequest` cannot be converted to protocol format
    pub fn to_protocol(
        &self,
    ) -> crate::Result<(Vec<ProtocolCredentialRequest>, ProtocolExpr<'static>)> {
        // Extract unique request items and convert to protocol
        let items = self.collect_items();
        let protocol_items: Vec<ProtocolCredentialRequest> = items
            .iter()
            .map(|item| item.to_protocol_item())
            .collect::<crate::Result<Vec<_>>>()?;

        // Build constraint expression
        let expr = match self {
            // If a constraint tree is only one item, we convert it to any(item)
            Self::Item(item) => ProtocolExpr::Any {
                any: vec![ProtocolNode::Type(Cow::Owned(
                    item.credential_type.as_str().to_string(),
                ))],
            },
            Self::Any { any } => ProtocolExpr::Any {
                any: any.iter().map(Self::to_protocol_node).collect(),
            },
            Self::All { all } => ProtocolExpr::All {
                all: all.iter().map(Self::to_protocol_node).collect(),
            },
            Self::Enumerate { enumerate } => ProtocolExpr::Enumerate {
                enumerate: enumerate.iter().map(Self::to_protocol_node).collect(),
            },
        };

        Ok((protocol_items, expr))
    }

    /// Converts constraint tree to protocol types (for top-level usage)
    ///
    /// Returns (`request_items`, `optional_constraint_expression`) tuple.
    /// The constraint expression is None for single items (no constraint needed).
    ///
    /// # Errors
    ///
    /// Returns an error if any `CredentialRequest` cannot be converted to protocol format
    pub fn to_protocol_top_level(
        &self,
    ) -> crate::Result<(
        Vec<ProtocolCredentialRequest>,
        Option<ProtocolExpr<'static>>,
    )> {
        // Extract unique request items and convert to protocol
        let items = self.collect_items();
        let protocol_items: Vec<ProtocolCredentialRequest> = items
            .iter()
            .map(|item| item.to_protocol_item())
            .collect::<crate::Result<Vec<_>>>()?;

        // Single item doesn't need constraint expression
        let expr = match self {
            Self::Item(_) => None, // Just one credential, no constraint needed
            Self::Any { any } => Some(ProtocolExpr::Any {
                any: any.iter().map(Self::to_protocol_node).collect(),
            }),
            Self::All { all } => Some(ProtocolExpr::All {
                all: all.iter().map(Self::to_protocol_node).collect(),
            }),
            Self::Enumerate { enumerate } => Some(ProtocolExpr::Enumerate {
                enumerate: enumerate.iter().map(Self::to_protocol_node).collect(),
            }),
        };

        Ok((protocol_items, expr))
    }
}

// UniFFI exports for ConstraintNode
#[cfg(feature = "ffi")]
#[uniffi::export]
#[allow(clippy::needless_pass_by_value)]
impl ConstraintNode {
    /// Creates an item constraint node from a `CredentialRequest`
    #[must_use]
    #[uniffi::constructor(name = "item")]
    pub fn ffi_item(request: Arc<CredentialRequest>) -> Arc<Self> {
        Arc::new(Self::item((*request).clone()))
    }

    /// Creates an "any" (OR) constraint node
    #[must_use]
    #[uniffi::constructor(name = "any")]
    pub fn ffi_any(nodes: Vec<Arc<Self>>) -> Arc<Self> {
        let core_nodes = nodes.iter().map(|n| (**n).clone()).collect();
        Arc::new(Self::any(core_nodes))
    }

    /// Creates an "all" (AND) constraint node
    #[must_use]
    #[uniffi::constructor(name = "all")]
    pub fn ffi_all(nodes: Vec<Arc<Self>>) -> Arc<Self> {
        let core_nodes = nodes.iter().map(|n| (**n).clone()).collect();
        Arc::new(Self::all(core_nodes))
    }

    /// Creates an "enumerate" constraint node
    #[must_use]
    #[uniffi::constructor(name = "enumerate")]
    pub fn ffi_enumerate(nodes: Vec<Arc<Self>>) -> Arc<Self> {
        let core_nodes = nodes.iter().map(|n| (**n).clone()).collect();
        Arc::new(Self::enumerate(core_nodes))
    }

    /// Serializes a constraint node to JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON serialization fails
    pub fn to_json(&self) -> std::result::Result<String, crate::error::IdkitError> {
        serde_json::to_string(&self)
            .map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
    }

    /// Deserializes a constraint node from JSON
    ///
    /// # Errors
    ///
    /// Returns an error if JSON deserialization fails
    #[uniffi::constructor(name = "from_json")]
    pub fn ffi_from_json(json: &str) -> std::result::Result<Arc<Self>, crate::error::IdkitError> {
        serde_json::from_str(json)
            .map(Arc::new)
            .map_err(|e| crate::error::IdkitError::from(crate::Error::from(e)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn orb_item() -> CredentialRequest {
        CredentialRequest::new(CredentialType::Orb, None)
    }

    fn face_item() -> CredentialRequest {
        CredentialRequest::new(CredentialType::Face, None)
    }

    fn device_item() -> CredentialRequest {
        CredentialRequest::new(CredentialType::Device, None)
    }

    fn document_item() -> CredentialRequest {
        CredentialRequest::new(CredentialType::Document, None)
    }

    fn secure_document_item() -> CredentialRequest {
        CredentialRequest::new(CredentialType::SecureDocument, None)
    }

    #[test]
    fn test_item_node() {
        let node = ConstraintNode::item(orb_item());
        let mut available = HashSet::new();
        available.insert(CredentialType::Orb);

        assert!(node.evaluate(&available));
        assert_eq!(node.first_satisfying(&available), Some(CredentialType::Orb));
    }

    #[test]
    fn test_any_node() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
            ConstraintNode::item(device_item()),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Face);
        available.insert(CredentialType::Device);

        assert!(node.evaluate(&available));
        // Should return Face because it's first in priority order
        assert_eq!(
            node.first_satisfying(&available),
            Some(CredentialType::Face)
        );
    }

    #[test]
    fn test_any_node_priority() {
        // Orb has highest priority, Face second
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Face);
        available.insert(CredentialType::Orb);

        // Even though both are available, Orb should be selected (higher priority)
        assert_eq!(node.first_satisfying(&available), Some(CredentialType::Orb));
    }

    #[test]
    fn test_all_node() {
        let node = ConstraintNode::all(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Orb);

        // Only one is available, should fail
        assert!(!node.evaluate(&available));

        available.insert(CredentialType::Face);

        // Both available, should succeed
        assert!(node.evaluate(&available));
        assert!(node.first_satisfying(&available).is_some());
    }

    #[test]
    fn test_enumerate_node() {
        let node = ConstraintNode::enumerate(vec![
            ConstraintNode::item(face_item()),
            ConstraintNode::item(device_item()),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Device);

        // Enumerate is satisfied when at least one child is available.
        assert!(node.evaluate(&available));
        assert_eq!(
            node.first_satisfying(&available),
            Some(CredentialType::Device)
        );

        available.clear();
        assert!(!node.evaluate(&available));
    }

    #[test]
    fn test_nested_constraints() {
        // Orb OR (secure_document OR document)
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::any(vec![
                ConstraintNode::item(secure_document_item()),
                ConstraintNode::item(document_item()),
            ]),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Document);

        assert!(node.evaluate(&available));
        assert_eq!(
            node.first_satisfying(&available),
            Some(CredentialType::Document)
        );
    }

    #[test]
    fn test_face_orb_example() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Face);

        // Only face available
        assert!(node.evaluate(&available));
        assert_eq!(
            node.first_satisfying(&available),
            Some(CredentialType::Face)
        );

        // Both available - orb has priority
        available.insert(CredentialType::Orb);
        assert_eq!(node.first_satisfying(&available), Some(CredentialType::Orb));
    }

    #[test]
    fn test_credential_categories_example() {
        // Example: Orb AND (secure_document OR document)
        let node = ConstraintNode::all(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::any(vec![
                ConstraintNode::item(secure_document_item()),
                ConstraintNode::item(document_item()),
            ]),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Orb);
        available.insert(CredentialType::Document);

        assert!(node.evaluate(&available));
    }

    #[test]
    fn test_collect_credential_types() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::all(vec![
                ConstraintNode::item(face_item()),
                ConstraintNode::item(device_item()),
            ]),
        ]);

        let credentials = node.collect_credential_types();
        assert_eq!(credentials.len(), 3);
        assert!(credentials.contains(&CredentialType::Orb));
        assert!(credentials.contains(&CredentialType::Face));
        assert!(credentials.contains(&CredentialType::Device));
    }

    #[test]
    fn test_collect_items() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::all(vec![
                ConstraintNode::item(face_item()),
                ConstraintNode::item(device_item()),
            ]),
        ]);

        let items = node.collect_items();
        assert_eq!(items.len(), 3);
    }

    #[test]
    fn test_validation() {
        let valid = ConstraintNode::any(vec![ConstraintNode::item(orb_item())]);
        assert!(valid.validate().is_ok());

        let invalid = ConstraintNode::any(vec![]);
        assert!(invalid.validate().is_err());

        let invalid_enumerate = ConstraintNode::enumerate(vec![]);
        assert!(invalid_enumerate.validate().is_err());
    }

    #[test]
    fn test_serialization() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
        ]);

        let json = serde_json::to_string(&node).unwrap();
        let deserialized: ConstraintNode = serde_json::from_str(&json).unwrap();

        // Check both have same credential types
        assert_eq!(
            node.collect_credential_types(),
            deserialized.collect_credential_types()
        );
    }

    #[test]
    fn test_to_protocol() {
        // Test any constraint
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
        ]);
        let (items, expr) = node.to_protocol().unwrap();

        assert_eq!(items.len(), 2);
        let json = serde_json::to_string(&expr).unwrap();
        assert!(json.contains("any"));
        assert!(json.contains("orb"));
        assert!(json.contains("face"));
    }

    #[test]
    fn test_to_protocol_enumerate() {
        let node = ConstraintNode::enumerate(vec![
            ConstraintNode::item(document_item()),
            ConstraintNode::item(device_item()),
        ]);
        let (items, expr) = node.to_protocol().unwrap();

        assert_eq!(items.len(), 2);
        let json = serde_json::to_string(&expr).unwrap();
        assert!(json.contains("enumerate"));
        assert!(json.contains("document"));
        assert!(json.contains("device"));
    }

    #[test]
    fn test_to_protocol_top_level_single_item() {
        // Single item should not have constraint expression
        let node = ConstraintNode::item(orb_item());
        let (items, expr) = node.to_protocol_top_level().unwrap();

        assert_eq!(items.len(), 1);
        assert!(expr.is_none());
    }

    #[test]
    fn test_to_protocol_top_level_multiple() {
        // Multiple items should have constraint expression
        let node = ConstraintNode::any(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::item(face_item()),
        ]);
        let (items, expr) = node.to_protocol_top_level().unwrap();

        assert_eq!(items.len(), 2);
        assert!(expr.is_some());
    }

    #[test]
    fn test_to_protocol_nested() {
        // Test nested constraint: all(orb, enumerate(document, device))
        let nested = ConstraintNode::all(vec![
            ConstraintNode::item(orb_item()),
            ConstraintNode::enumerate(vec![
                ConstraintNode::item(document_item()),
                ConstraintNode::item(device_item()),
            ]),
        ]);
        let (items, expr) = nested.to_protocol().unwrap();

        assert_eq!(items.len(), 3);
        let nested_json = serde_json::to_string(&expr).unwrap();
        assert!(nested_json.contains("all"));
        assert!(nested_json.contains("enumerate"));
        assert!(nested_json.contains("orb"));
        assert!(nested_json.contains("document"));
        assert!(nested_json.contains("device"));
    }
}
