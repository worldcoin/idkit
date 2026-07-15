package com.worldcoin.idkit.internal

import kotlinx.serialization.json.Json

/**
 * Shared JSON configuration for the FFI boundary.
 *
 * - `ignoreUnknownKeys`: the Rust side may add fields; decoding must not break.
 * - `explicitNulls = false`: absent optionals are omitted, matching the Rust
 *   DTOs' `#[serde(default)]` fields (the config DTO rejects unknown keys, so
 *   field names must match exactly — but nulls may simply be dropped).
 * - `classDiscriminator = "type"`: matches core `Preset`'s `#[serde(tag = "type")]`.
 */
internal val IdKitJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = false
    classDiscriminator = "type"
}
