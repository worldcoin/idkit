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
	encryption: typeof WasmModule.BridgeEncryption.prototype | null
	requestId: string | null
	connectorURI: string | null
	result: ISuccessResult | null
	errorCode: AppErrorCodes | null
	verificationState: VerificationState

	createClient: (config: IDKitConfig) => Promise<void>
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

	createClient: async ({ bridge_url, app_id, verification_level, action_description, action, signal, partner }) => {
		// Ensure WASM is initialized
		await initIDKit()

		// Generate encryption key
		const encryption = new WasmModule.BridgeEncryption()

		// Validate bridge URL
		if (bridge_url) {
			const validation = validate_bridge_url(bridge_url, app_id.includes('staging'))
			if (!validation.valid) {
				console.error(validation.errors.join('\n'))
				set({ verificationState: VerificationState.Failed })
				throw new Error('Invalid bridge_url. Please check the console for more details.')
			}
		}

		// Prepare request payload
		const payload = JSON.stringify({
			app_id,
			action_description,
			action: encodeAction(action),
			signal: generateSignal(signal).digest,
			credential_types: verification_level_to_credential_types(
				verification_level ?? DEFAULT_VERIFICATION_LEVEL
			),
			verification_level: verification_level ?? DEFAULT_VERIFICATION_LEVEL,
		})

		// Encrypt payload using WASM
		const encryptedPayload = encryption.encrypt(payload)
		const nonceB64 = encryption.nonceBase64()

		// Send request to bridge
		const res = await fetch(new URL('/request', bridge_url ?? DEFAULT_BRIDGE_URL), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				iv: nonceB64,
				payload: encryptedPayload,
			}),
		})

		if (!res.ok) {
			set({ verificationState: VerificationState.Failed })
			throw new Error('Failed to create client')
		}

		const { request_id } = (await res.json()) as { request_id: string }

		// Build connector URI
		const keyB64 = encryption.keyBase64()
		const finalBridgeUrl = bridge_url ?? DEFAULT_BRIDGE_URL

		set({
			encryption,
			requestId: request_id,
			bridge_url: finalBridgeUrl,
			verificationState: VerificationState.WaitingForConnection,
			connectorURI: `https://world.org/verify?t=wld&i=${request_id}&k=${encodeURIComponent(keyB64)}${
				bridge_url && bridge_url !== DEFAULT_BRIDGE_URL ? `&b=${encodeURIComponent(bridge_url)}` : ''
			}${partner ? `&partner=${encodeURIComponent(true)}` : ''}`,
		})
	},

	pollForUpdates: async () => {
		const encryption = get().encryption
		if (!encryption) throw new Error('No encryption context found. Please call `createClient` first.')

		const res = await fetch(new URL(`/response/${get().requestId}`, get().bridge_url))

		if (!res.ok) {
			return set({
				errorCode: AppErrorCodes.ConnectionFailed,
				verificationState: VerificationState.Failed,
			})
		}

		const { response, status } = (await res.json()) as BridgeResponse

		if (status !== ResponseStatus.Completed) {
			return set({
				verificationState:
					status == ResponseStatus.Retrieved
						? VerificationState.WaitingForApp
						: VerificationState.WaitingForConnection,
			})
		}

		// Decrypt response using WASM
		let result = JSON.parse(encryption.decrypt(response.payload)) as BridgeResult

		if ('error_code' in result) {
			return set({
				errorCode: result.error_code,
				verificationState: VerificationState.Failed,
			})
		}

		// Convert credential_type to verification_level if needed
		if ('credential_type' in result) {
			result = {
				verification_level: credential_type_to_verification_level(result.credential_type),
				...result,
			} satisfies ISuccessResult
		}

		set({
			result,
			encryption: null,
			requestId: null,
			connectorURI: null,
			verificationState: VerificationState.Confirmed,
		})
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
