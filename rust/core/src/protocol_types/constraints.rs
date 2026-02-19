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

impl ConstraintExpr<'_> {
    /// Evaluate the constraint against a predicate that reports whether a credential was provided.
    pub fn evaluate<F>(&self, has_type: &F) -> bool
    where
        F: Fn(&str) -> bool,
    {
        match self {
            ConstraintExpr::All { all } => all.iter().all(|n| n.evaluate(has_type)),
            ConstraintExpr::Any { any } => any.iter().any(|n| n.evaluate(has_type)),
            ConstraintExpr::Enumerate { enumerate } => {
                enumerate.iter().any(|n| n.evaluate(has_type))
            }
        }
    }

    /// Validate the maximum nesting depth.
    #[must_use]
    pub fn validate_max_depth(&self, max_depth: usize) -> bool {
        fn validate_expr(expr: &ConstraintExpr<'_>, depth: usize, max_depth: usize) -> bool {
            if depth > max_depth {
                return false;
            }
            match expr {
                ConstraintExpr::All { all } => {
                    all.iter().all(|n| validate_node(n, depth, max_depth))
                }
                ConstraintExpr::Any { any } => {
                    any.iter().all(|n| validate_node(n, depth, max_depth))
                }
                ConstraintExpr::Enumerate { enumerate } => {
                    enumerate.iter().all(|n| validate_node(n, depth, max_depth))
                }
            }
        }
        fn validate_node(node: &ConstraintNode<'_>, parent_depth: usize, max_depth: usize) -> bool {
            match node {
                ConstraintNode::Type(_) => true,
                ConstraintNode::Expr(child) => validate_expr(child, parent_depth + 1, max_depth),
            }
        }
        validate_expr(self, 1, max_depth)
    }

    /// Validate the maximum total number of nodes.
    #[must_use]
    pub fn validate_max_nodes(&self, max_nodes: usize) -> bool {
        fn count_expr(expr: &ConstraintExpr<'_>, count: &mut usize, max_nodes: usize) -> bool {
            *count += 1;
            if *count > max_nodes {
                return false;
            }
            match expr {
                ConstraintExpr::All { all } => {
                    for n in all {
                        if !count_node(n, count, max_nodes) {
                            return false;
                        }
                    }
                    true
                }
                ConstraintExpr::Any { any } => {
                    for n in any {
                        if !count_node(n, count, max_nodes) {
                            return false;
                        }
                    }
                    true
                }
                ConstraintExpr::Enumerate { enumerate } => {
                    for n in enumerate {
                        if !count_node(n, count, max_nodes) {
                            return false;
                        }
                    }
                    true
                }
            }
        }

        fn count_node(node: &ConstraintNode<'_>, count: &mut usize, max_nodes: usize) -> bool {
            match node {
                ConstraintNode::Type(_) => {
                    *count += 1;
                    *count <= max_nodes
                }
                ConstraintNode::Expr(child) => count_expr(child, count, max_nodes),
            }
        }

        let mut count = 0;
        count_expr(self, &mut count, max_nodes)
    }
}

impl ConstraintNode<'_> {
    fn evaluate<F>(&self, has_type: &F) -> bool
    where
        F: Fn(&str) -> bool,
    {
        match self {
            ConstraintNode::Type(t) => has_type(t),
            ConstraintNode::Expr(expr) => expr.evaluate(has_type),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_constraint() {
        let expr = ConstraintExpr::All {
            all: vec![
                ConstraintNode::Type("orb".into()),
                ConstraintNode::Type("document".into()),
            ],
        };

        // Both present
        assert!(expr.evaluate(&|t| t == "orb" || t == "document"));
        // Only one present
        assert!(!expr.evaluate(&|t| t == "orb"));
    }

    #[test]
    fn test_any_constraint() {
        let expr = ConstraintExpr::Any {
            any: vec![
                ConstraintNode::Type("orb".into()),
                ConstraintNode::Type("document".into()),
            ],
        };

        // One present
        assert!(expr.evaluate(&|t| t == "orb"));
        // None present
        assert!(!expr.evaluate(&|_| false));
    }

    #[test]
    fn test_nested_constraint() {
        // all: [orb, enumerate: [document, device]]
        let expr = ConstraintExpr::All {
            all: vec![
                ConstraintNode::Type("orb".into()),
                ConstraintNode::Expr(ConstraintExpr::Enumerate {
                    enumerate: vec![
                        ConstraintNode::Type("document".into()),
                        ConstraintNode::Type("device".into()),
                    ],
                }),
            ],
        };

        // orb + document
        assert!(expr.evaluate(&|t| t == "orb" || t == "document"));
        // orb + device
        assert!(expr.evaluate(&|t| t == "orb" || t == "device"));
        // only orb
        assert!(!expr.evaluate(&|t| t == "orb"));
    }

    #[test]
    fn test_enumerate_constraint() {
        let expr = ConstraintExpr::Enumerate {
            enumerate: vec![
                ConstraintNode::Type("passport".into()),
                ConstraintNode::Type("national_id".into()),
            ],
        };

        // One present
        assert!(expr.evaluate(&|t| t == "passport"));
        // None present
        assert!(!expr.evaluate(&|_| false));
    }

    #[test]
    fn test_json_roundtrip() {
        let expr = ConstraintExpr::Enumerate {
            enumerate: vec![
                ConstraintNode::Type("orb".into()),
                ConstraintNode::Expr(ConstraintExpr::Any {
                    any: vec![ConstraintNode::Type("document".into())],
                }),
            ],
        };

        let json = serde_json::to_string(&expr).unwrap();
        let parsed: ConstraintExpr = serde_json::from_str(&json).unwrap();
        assert_eq!(expr, parsed);
    }
}
