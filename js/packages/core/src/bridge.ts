/**
 * IDKit Bridge Client
 * Handles communication with the World ID bridge using WASM for cryptography
 */

import { create, type StateCreator } from 'zustand'
import type { IDKitConfig, CredentialType } from './types/config'
import type { ISuccessResult } from './types/result'
import { VerificationState, AppErrorCodes, ResponseStatus } from './types/bridge'
import { validate_bridge_url } from './lib/validation'
import { encodeAction, generateSignal } from './lib/hashing'
import {
	DEFAULT_VERIFICATION_LEVEL,
	credential_type_to_verification_level,
	verification_level_to_credential_types,
} from './lib/utils'
import { WasmModule, initIDKit } from './lib/wasm'
import { WorldBridgeClient } from './client'

const DEFAULT_BRIDGE_URL = 'https://bridge.worldcoin.org'

type BridgeResponse =
	| {
			status: ResponseStatus.Retrieved | ResponseStatus.Initialized
			response: null
	  }
	| {
			status: ResponseStatus.Completed
			response: { iv: string; payload: string }
	  }

type BridgeResult =
	| ISuccessResult
	| (Omit<ISuccessResult, 'verification_level'> & { credential_type: CredentialType })
	| { error_code: AppErrorCodes }

export type WorldBridgeStore = {
	bridge_url: string

	// V2 BACKWARD COMPAT: Legacy mutable state
	encryption: typeof WasmModule.BridgeEncryption.prototype | null
	requestId: string | null
	connectorURI: string | null
	result: ISuccessResult | null
	errorCode: AppErrorCodes | null
	verificationState: VerificationState

	// V3 NEW API: Returns immutable client
	createClient: (config: IDKitConfig) => Promise<WorldBridgeClient>

	// V2 BACKWARD COMPAT: Manual polling (deprecated)
	/** @deprecated Use client.waitForProof() instead */
	pollForUpdates: () => Promise<void>

	reset: () => void
}

const createStoreImplementation: StateCreator<WorldBridgeStore> = (set, get) => ({
	encryption: null,
	result: null,
	errorCode: null,
	requestId: null,
	connectorURI: null,
	bridge_url: DEFAULT_BRIDGE_URL,
	verificationState: VerificationState.PreparingClient,

	createClient: async ({ bridge_url, app_id, verification_level, action, signal }) => {
		// Ensure WASM is initialized
		await initIDKit()

		// Validate bridge URL (optional for v3)
		if (bridge_url) {
			const validation = validate_bridge_url(bridge_url, app_id.includes('staging'))
			if (!validation.valid) {
				console.error(validation.errors.join('\n'))
				set({ verificationState: VerificationState.Failed })
				throw new Error('Invalid bridge_url. Please check the console for more details.')
			}
		}

		// V3: Create WASM Session
		const session = await new WasmModule.Session(
			app_id,
			encodeAction(action),
			verification_level ?? DEFAULT_VERIFICATION_LEVEL,
			signal ? generateSignal(signal).digest : null
		)

		const client = new WorldBridgeClient(session)

		// V2 BACKWARD COMPAT: Update store state for legacy code
		set({
			requestId: client.requestId,
			connectorURI: client.connectorURI,
			bridge_url: bridge_url ?? DEFAULT_BRIDGE_URL,
			verificationState: VerificationState.WaitingForConnection,
			encryption: null, // V3 doesn't expose encryption directly
			result: null,
			errorCode: null,
		})

		// Store client reference for pollForUpdates (V2 compat)
		;(get() as any)._activeClient = client

		return client
	},

	pollForUpdates: async () => {
		// V2 BACKWARD COMPAT: Use client if available
		const client = (get() as any)._activeClient as WorldBridgeClient | undefined

		if (!client) {
			throw new Error('No active client. Please call createClient() first.')
		}

		const status = await client.pollOnce()

		if (status.type === 'awaiting_confirmation') {
			set({ verificationState: VerificationState.WaitingForApp })
		} else if (status.type === 'confirmed' && status.proof) {
			set({
				result: status.proof,
				verificationState: VerificationState.Confirmed,
				requestId: null,
				connectorURI: null,
			})
			;(get() as any)._activeClient = undefined
		} else if (status.type === 'failed') {
			set({
				errorCode: status.error ?? AppErrorCodes.UnexpectedResponse,
				verificationState: VerificationState.Failed,
			})
			;(get() as any)._activeClient = undefined
		}
	},

	reset: () => {
		set({
			encryption: null,
			result: null,
			errorCode: null,
			requestId: null,
			connectorURI: null,
			verificationState: VerificationState.PreparingClient,
		})
		;(get() as any)._activeClient = undefined
	},
})

/**
 * Single instance of the store (vanilla)
 */
const store = create<WorldBridgeStore>(createStoreImplementation)

/**
 * Hook-compatible export that also works as direct function call for v2 compatibility
 *
 * Usage:
 * - React: const state = useWorldBridgeStore() or useWorldBridgeStore(selector)
 * - Vanilla: const store = useWorldBridgeStore.getState()
 * - Legacy v2: const store = useWorldBridgeStore() (works outside React)
 */
export const useWorldBridgeStore = Object.assign(
	// Make it callable directly for v2 compatibility (returns state when called outside React)
	(...args: unknown[]) => (args.length === 0 ? store.getState() : store(...(args as [any]))),
	// Also expose all store methods
	store
)

/**
 * Factory function to create a new instance of the store
 */
export const createWorldBridgeStore = () => create<WorldBridgeStore>(createStoreImplementation)
