//! Deterministic RP signature CLI for cross-language parity tests.
//!
//! Usage: rp-sign-vectors <key_hex> <nonce_hex> <created_at> <expires_at>
//!
//! Outputs JSON: {"sig":"0x...","nonce":"0x...","created_at":N,"expires_at":N}

use std::str::FromStr;

use idkit::rp_signature::sign_rp_message;
use k256::ecdsa::SigningKey;
use world_id_primitives::FieldElement;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 5 {
        eprintln!("usage: rp-sign-vectors <key_hex> <nonce_hex> <created_at> <expires_at>");
        std::process::exit(1);
    }

    let key_hex = args[1].strip_prefix("0x").unwrap_or(&args[1]);
    let key_bytes = hex::decode(key_hex).expect("invalid key hex");
    let signing_key =
        SigningKey::from_bytes(key_bytes.as_slice().into()).expect("invalid signing key");

    let nonce = FieldElement::from_str(&args[2]).expect("invalid nonce");
    let created_at: u64 = args[3].parse().expect("invalid created_at");
    let expires_at: u64 = args[4].parse().expect("invalid expires_at");

    let result =
        sign_rp_message(&signing_key, nonce, created_at, expires_at).expect("signing failed");

    let output = serde_json::json!({
        "sig": result.sig,
        "nonce": result.nonce,
        "created_at": result.created_at,
        "expires_at": result.expires_at,
    });

    println!("{output}");
}
