/**
 * @worldcoin/idkit/react
 * React components and hooks for IDKit
 */

export { IDKitWidget } from './IDKitWidget'
export type { WidgetProps, WidgetConfig, WidgetStatus } from './types'

// Re-export commonly used types from core for convenience
export { VerificationLevel } from '../types/config'
export type { ISuccessResult, IErrorState } from '../types/result'
export type { CredentialType } from '../types/config'
