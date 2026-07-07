package com.worldcoin.idkit

/** Thrown for invalid client-side input (blank app id, malformed URLs, ...). */
public class IDKitClientError(message: String) : IllegalArgumentException(message)

/**
 * Thrown when the native layer reports an error while creating a request or
 * building a payload. [code] is the wire-level error code (e.g.
 * `malformed_request`, `connection_failed`); the message carries actionable
 * detail from the Rust core.
 */
public class IDKitException(
    public val code: String,
    message: String,
) : RuntimeException(message)
