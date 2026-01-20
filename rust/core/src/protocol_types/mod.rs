//! Lightweight World ID Protocol 4.0 types.
//!
//! This module provides JSON-compatible types for the World ID Protocol that don't
//! require heavy crypto dependencies (ark-*, groth16, etc.). These types are designed
//! for serialization/deserialization only - no cryptographic operations are performed.
//!
//! ## Design Philosophy
//!
//! The types in this module are **bridge types** - they're designed to:
//! - Be fully JSON-compatible with the canonical `world-id-core` types
//! - Work in WASM environments (no tokio, no heavy crypto deps)
//! - Pass data through without performing crypto operations
//!
//! ## Future Migration
//!
//! When `world-id-core` becomes WASM-compatible, this module can be replaced
//! with direct re-exports from that crate. The JSON format is intentionally
//! identical to ensure compatibility.
//!
//! ## Example
//!
//! ```ignore
//! use idkit::protocol_types::{ProofRequest, ProofResponse, FieldElement};
//!
//! // Parse a proof request from JSON
//! let request: ProofRequest = serde_json::from_str(json)?;
//!
//! // Work with field elements
//! let issuer_id = FieldElement::from_u64(1);
//!
//! // Serialize a response back to JSON
//! let json = serde_json::to_string(&response)?;
//! ```

mod constraints;
mod requests;

// Re-export constraints
pub use constraints::{ConstraintExpr, ConstraintNode, MAX_CONSTRAINT_NODES};

// Re-export requests
pub use requests::{
    ProofRequest, ProofResponse, RequestItem, RequestVersion, ResponseItem, ValidationError,
};
