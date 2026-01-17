/**
 * @worldcoin/idkit/react
 * React components and hooks for IDKit
 */

export { IDKitWidget } from './IDKitWidget'
export type { WidgetProps, WidgetConfig, WidgetStatus } from './types'

// Re-export commonly used types from core for convenience
export type { ISuccessResult, IErrorState } from '../types/result'
export type { CredentialType, RequestConfig } from '../types/config'
