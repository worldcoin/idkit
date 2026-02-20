//! Constraint expression types for World ID Protocol 4.0.
//!
//! These types define the constraint logic for proof requests.
//! They're copied from `world-id-core` but don't require any external dependencies.

use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// Upper bound on total constraint AST nodes (expr + type nodes).
pub const MAX_CONSTRAINT_NODES: usize = 12;

/// Constraint expression tree: either a list of types/expressions under `all`, `any`, or `enumerate`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(untagged)]
pub enum ConstraintExpr<'a> {
    /// All children must be satisfied
    All {
        /// Children nodes that must all be satisfied
        all: Vec<ConstraintNode<'a>>,
    },
    /// Any child may satisfy the expression
    Any {
        /// Children nodes where any one must be satisfied
        any: Vec<ConstraintNode<'a>>,
    },
    /// All satisfiable children should be selected
    Enumerate {
        /// Children nodes to evaluate and collect if satisfiable
        enumerate: Vec<ConstraintNode<'a>>,
    },
}

/// Node of a constraint expression.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(untagged)]
pub enum ConstraintNode<'a> {
    /// Credential identifier string (e.g., "orb", "document")
    Type(Cow<'a, str>),
    /// Nested expression
    Expr(ConstraintExpr<'a>),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_roundtrip() {
        let expr = ConstraintExpr::All {
            all: vec![
                ConstraintNode::Type("orb".into()),
                ConstraintNode::Expr(ConstraintExpr::Any {
                    any: vec![ConstraintNode::Type("document".into())],
                }),
                ConstraintNode::Expr(ConstraintExpr::Enumerate {
                    enumerate: vec![
                        ConstraintNode::Type("passport".into()),
                        ConstraintNode::Type("national_id".into()),
                    ],
                }),
            ],
        };

        let json = serde_json::to_string(&expr).unwrap();
        let parsed: ConstraintExpr = serde_json::from_str(&json).unwrap();
        assert_eq!(expr, parsed);
    }
}
