/**
 * @worldcoin/idkit-core
 * Core bridge logic for IDKit powered by Rust/WASM
 */

// V3 NEW API: Immutable client
export { WorldBridgeClient, type WaitOptions, type Status } from './client'

// Bridge store (supports both V2 and V3 APIs)
export { useWorldBridgeStore, createWorldBridgeStore, type WorldBridgeStore } from './bridge'

// Types
export type { IDKitConfig, AbiEncodedValue } from './types/config'
export type { ISuccessResult, IErrorState } from './types/result'
export { VerificationLevel } from './types/config'
export { AppErrorCodes, VerificationState, ResponseStatus } from './types/bridge'

// Backend verification
export { verifyCloudProof, type IVerifyResponse } from './lib/backend'

// Utilities
export { DEFAULT_VERIFICATION_LEVEL, buffer_encode, buffer_decode } from './lib/utils'
export { solidityEncode, hashToField, generateSignal, encodeAction } from './lib/hashing'
export { initIDKit, isInitialized } from './lib/wasm'
export { isReactNative, isWeb, isNode } from './lib/platform'

// WASM exports
export { WasmModule } from './lib/wasm'
