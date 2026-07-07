package com.worldcoin.idkit.internal

import kotlinx.coroutines.CoroutineDispatcher

/**
 * Dispatcher for the blocking FFI calls (network-bound bridge create/poll).
 * `Dispatchers.IO` exists on both JVM and Native but is not exposed in the
 * common API, hence this seam.
 */
internal expect val ioDispatcher: CoroutineDispatcher
