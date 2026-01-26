//! Lightweight World ID Protocol 4.0 types.
//!
//! TODO: Migrate `ProofRequest` and `ProofResponse` once they are Wasm-compatible

mod constraints;
mod requests;

// Re-export constraints
pub use constraints::{ConstraintExpr, ConstraintNode, MAX_CONSTRAINT_NODES};

// Re-export requests
pub use requests::{
    CredentialRequest, ProofRequest, ProofResponse, RequestVersion, ResponseItem, ValidationError,
};
