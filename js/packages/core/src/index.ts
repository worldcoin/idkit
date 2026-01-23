/**
 * @worldcoin/idkit-core
 * Core bridge logic for IDKit powered by Rust/WASM
 * Pure TypeScript - no dependencies
 */

// Session API (main entry point)
export { createSession, type Session, type SessionOptions, type Status, type WaitOptions, type RpContext } from './session'

// Types
export type { IDKitConfig, AbiEncodedValue, RequestConfig, CredentialType } from './types/config'
export type { ISuccessResult, IErrorState } from './types/result'
export { AppErrorCodes, VerificationState, ResponseStatus } from './types/bridge'

// Backend verification
export { verifyCloudProof, type IVerifyResponse } from './lib/backend'

// Utilities
export { isReactNative, isWeb, isNode } from './lib/platform'

// WASM exports
export { initIDKit, isInitialized, WasmModule } from './lib/wasm'
