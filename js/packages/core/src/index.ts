/**
 * @worldcoin/idkit-core
 * Core bridge logic for IDKit powered by Rust/WASM
 */

// Bridge store
export { useWorldBridgeStore, createWorldBridgeStore, type WorldBridgeStore } from './bridge'

// Types
export type { IDKitConfig, AbiEncodedValue } from './types/config'
export type { ISuccessResult, IErrorState } from './types/result'
export { CredentialType, VerificationLevel } from './types/config'
export { AppErrorCodes, VerificationState, ResponseStatus } from './types/bridge'

// Utilities
export { DEFAULT_VERIFICATION_LEVEL, verification_level_to_credential_types, credential_type_to_verification_level } from './lib/utils'
export { solidityEncode, hashToField, generateSignal, encodeAction } from './lib/hashing'
export { initIDKit, isInitialized } from './lib/wasm'

// WASM exports
export { WasmModule } from './lib/wasm'
