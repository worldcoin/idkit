/**
 * @worldcoin/idkit-core
 * 
 * Core IDKit SDK for World ID verification
 */

// Initialize WASM
export { initIDKit, isInitialized } from './wasm-loader.js';

// Core types
export {
  Credential,
  VerificationLevel,
  SessionStatus,
  AppError,
  IDKitError,
  type ConstraintNode,
  type Request,
  type SessionConfig,
  type Proof,
  type StatusResponse,
} from './types.js';

// Session management
export { Session } from './session.js';

// Utilities
export { encodeSignal } from './utils.js';

// Re-export WASM bindings for advanced use
export {
  WasmAppId,
  WasmRequest,
  WasmConstraints,
} from './wasm-loader.js';
