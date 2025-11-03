//! # `IDKit` Core
//!
//! Core Rust implementation of the World ID SDK for Relying Parties.
//! This library provides the fundamental types for interacting with
//! the World ID protocol.

#![warn(clippy::all, clippy::pedantic, clippy::nursery)]
#![allow(clippy::module_name_repetitions)]

pub mod error;
pub mod types;

// Re-export main types for convenience
pub use error::{Error, Result};
pub use types::{Credential, Proof, Request};

// UniFFI scaffolding for core types
#[cfg(feature = "uniffi-bindings")]
uniffi::setup_scaffolding!("idkit_core");
