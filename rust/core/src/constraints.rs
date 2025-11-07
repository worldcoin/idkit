//! Constraint system for declarative credential requests
//!
//! This module implements the constraint tree structure that allows RPs to
//! declaratively specify which credentials they'll accept, with support for
//! AND/OR logic and priority ordering.

use crate::types::CredentialType;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A node in the constraint tree
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConstraintNode {
    /// A leaf node representing a single credential type
    Credential(CredentialType),

    /// An OR node - at least one child must be satisfied
    /// Order matters: earlier credentials have higher priority
    Any {
        /// Child constraints (priority ordered)
        any: Vec<ConstraintNode>,
    },

    /// An AND node - all children must be satisfied
    All {
        /// Child constraints (all required)
        all: Vec<ConstraintNode>,
    },
}

impl ConstraintNode {
    /// Creates an Any constraint from credentials
    #[must_use]
    pub fn any(nodes: Vec<Self>) -> Self {
        Self::Any { any: nodes }
    }

    /// Creates an All constraint from credentials
    #[must_use]
    pub fn all(nodes: Vec<Self>) -> Self {
        Self::All { all: nodes }
    }

    /// Creates a credential node
    #[must_use]
    pub fn credential(cred: CredentialType) -> Self {
        Self::Credential(cred)
    }

    /// Evaluates the constraint against available credentials
    #[must_use]
    pub fn evaluate(&self, available: &HashSet<CredentialType>) -> bool {
        match self {
            Self::Credential(cred) => available.contains(cred),
            Self::Any { any } => any.iter().any(|node| node.evaluate(available)),
            Self::All { all } => all.iter().all(|node| node.evaluate(available)),
        }
    }

    /// Returns the first satisfying credential in priority order
    ///
    /// For Any nodes, returns the first child that evaluates to true.
    /// For All nodes, returns None if not all satisfied, or attempts to find a single credential.
    /// For Credential nodes, returns the credential if available.
    #[must_use]
    pub fn first_satisfying(&self, available: &HashSet<CredentialType>) -> Option<CredentialType> {
        match self {
            Self::Credential(cred) => {
                if available.contains(cred) {
                    Some(*cred)
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
        }
    }

    /// Collects all credentials mentioned in this constraint tree
    #[must_use]
    pub fn collect_credentials(&self) -> HashSet<CredentialType> {
        let mut result = HashSet::new();
        self.collect_credentials_recursive(&mut result);
        result
    }

    fn collect_credentials_recursive(&self, result: &mut HashSet<CredentialType>) {
        match self {
            Self::Credential(cred) => {
                result.insert(*cred);
            }
            Self::Any { any } => {
                for node in any {
                    node.collect_credentials_recursive(result);
                }
            }
            Self::All { all } => {
                for node in all {
                    node.collect_credentials_recursive(result);
                }
            }
        }
    }

    /// Validates the constraint tree structure
    ///
    /// # Errors
    ///
    /// Returns an error if the tree is invalid (e.g., empty Any/All nodes)
    pub fn validate(&self) -> crate::Result<()> {
        match self {
            Self::Credential(_) => Ok(()),
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
        }
    }
}

/// Top-level constraints for a request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraints {
    /// The root constraint node
    #[serde(flatten)]
    pub root: ConstraintNode,
}

impl Constraints {
    /// Creates new constraints from a node
    #[must_use]
    pub fn new(root: ConstraintNode) -> Self {
        Self { root }
    }

    /// Creates constraints requiring any of the given credentials
    #[must_use]
    pub fn any(credentials: Vec<CredentialType>) -> Self {
        Self {
            root: ConstraintNode::any(
                credentials
                    .into_iter()
                    .map(ConstraintNode::credential)
                    .collect(),
            ),
        }
    }

    /// Creates constraints requiring all of the given credentials
    #[must_use]
    pub fn all(credentials: Vec<CredentialType>) -> Self {
        Self {
            root: ConstraintNode::all(
                credentials
                    .into_iter()
                    .map(ConstraintNode::credential)
                    .collect(),
            ),
        }
    }

    /// Evaluates the constraints against available credentials
    #[must_use]
    pub fn evaluate(&self, available: &HashSet<CredentialType>) -> bool {
        self.root.evaluate(available)
    }

    /// Returns the first satisfying credential
    #[must_use]
    pub fn first_satisfying(&self, available: &HashSet<CredentialType>) -> Option<CredentialType> {
        self.root.first_satisfying(available)
    }

    /// Validates the constraints
    ///
    /// # Errors
    ///
    /// Returns an error if the constraints are invalid
    pub fn validate(&self) -> crate::Result<()> {
        self.root.validate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_node() {
        let node = ConstraintNode::credential(CredentialType::Orb);
        let mut available = HashSet::new();
        available.insert(CredentialType::Orb);

        assert!(node.evaluate(&available));
        assert_eq!(node.first_satisfying(&available), Some(CredentialType::Orb));
    }

    #[test]
    fn test_any_node() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::credential(CredentialType::Face),
            ConstraintNode::credential(CredentialType::Device),
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
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::credential(CredentialType::Face),
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
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::credential(CredentialType::Face),
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
    fn test_nested_constraints() {
        // Orb OR (secure_document OR document)
        let node = ConstraintNode::any(vec![
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::any(vec![
                ConstraintNode::credential(CredentialType::SecureDocument),
                ConstraintNode::credential(CredentialType::Document),
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
        // Any(orb with face_auth, face with face_auth)
        let node = ConstraintNode::any(vec![
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::credential(CredentialType::Face),
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
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::any(vec![
                ConstraintNode::credential(CredentialType::SecureDocument),
                ConstraintNode::credential(CredentialType::Document),
            ]),
        ]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Orb);
        available.insert(CredentialType::Document);

        assert!(node.evaluate(&available));
    }

    #[test]
    fn test_collect_credentials() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::all(vec![
                ConstraintNode::credential(CredentialType::Face),
                ConstraintNode::credential(CredentialType::Device),
            ]),
        ]);

        let credentials = node.collect_credentials();
        assert_eq!(credentials.len(), 3);
        assert!(credentials.contains(&CredentialType::Orb));
        assert!(credentials.contains(&CredentialType::Face));
        assert!(credentials.contains(&CredentialType::Device));
    }

    #[test]
    fn test_validation() {
        let valid = ConstraintNode::any(vec![ConstraintNode::credential(CredentialType::Orb)]);
        assert!(valid.validate().is_ok());

        let invalid = ConstraintNode::any(vec![]);
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn test_serialization() {
        let node = ConstraintNode::any(vec![
            ConstraintNode::credential(CredentialType::Orb),
            ConstraintNode::credential(CredentialType::Face),
        ]);

        let json = serde_json::to_string(&node).unwrap();
        let deserialized: ConstraintNode = serde_json::from_str(&json).unwrap();
        assert_eq!(node, deserialized);
    }

    #[test]
    fn test_constraints_wrapper() {
        let constraints = Constraints::any(vec![CredentialType::Orb, CredentialType::Device]);

        let mut available = HashSet::new();
        available.insert(CredentialType::Device);

        assert!(constraints.evaluate(&available));
        assert_eq!(
            constraints.first_satisfying(&available),
            Some(CredentialType::Device)
        );
    }
}
