/**
 * Immutable World ID verification client
 *
 * Provides a clean, promise-based API for World ID verification flows.
 * Each client represents a single verification session.
 *
 * @example
 * ```typescript
 * const store = useWorldBridgeStore()
 * const client = await store.createClient({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   verification_level: VerificationLevel.Orb,
 *   signal: 'user-id-123',
 * })
 *
 * // Display QR code
 * console.log('Scan this:', client.connectorURI)
 *
 * // Wait for proof
 * try {
 *   const proof = await client.waitForProof()
 *   console.log('Success:', proof)
 * } catch (error) {
 *   console.error('Failed:', error)
 * }
 * ```
 */

import type { WasmModule } from './lib/wasm'
import type { ISuccessResult } from './types/result'
import { AppErrorCodes } from './types/bridge'

/** Options for waitForProof() */
export interface WaitOptions {
	/** Milliseconds between polls (default: 1000) */
	pollInterval?: number
	/** Total timeout in milliseconds (default: 300000 = 5 minutes) */
	timeout?: number
	/** AbortSignal for cancellation */
	signal?: AbortSignal
}

/** Status returned from pollOnce() */
export interface Status {
	type: 'waiting_for_connection' | 'awaiting_confirmation' | 'confirmed' | 'failed'
	proof?: ISuccessResult
	error?: AppErrorCodes
}

/**
 * Immutable client for World ID verification
 *
 * This class wraps the WASM Session and provides a clean TypeScript API.
 * Clients are immutable - all properties are read-only.
 */
export class WorldBridgeClient {
	private session: InstanceType<typeof WasmModule.Session>
	private _connectorURI: string
	private _requestId: string

	/**
	 * @internal
	 * Creates a new client (called by store.createClient())
	 */
	constructor(session: InstanceType<typeof WasmModule.Session>) {
		this.session = session
		this._connectorURI = session.connectUrl()
		this._requestId = session.requestId()
	}

	/**
	 * QR code URL for World App
	 *
	 * Display this URL as a QR code for users to scan with World App.
	 *
	 * @example
	 * ```typescript
	 * console.log('Scan this QR code:', client.connectorURI)
	 * // or with QR code library:
	 * QRCode.toCanvas(canvas, client.connectorURI)
	 * ```
	 */
	get connectorURI(): string {
		return this._connectorURI
	}

	/**
	 * Unique request ID for this verification
	 */
	get requestId(): string {
		return this._requestId
	}

	/**
	 * Wait for proof from World App (handles polling automatically)
	 *
	 * This method polls the bridge until the user completes the verification
	 * or an error occurs. It handles all the polling logic internally.
	 *
	 * @param options - Optional configuration for polling and timeout
	 * @returns Promise that resolves with the proof when verification succeeds
	 * @throws {Error} On timeout, cancellation, or verification failure
	 *
	 * @example
	 * ```typescript
	 * // Basic usage
	 * const proof = await client.waitForProof()
	 *
	 * // With custom options
	 * const proof = await client.waitForProof({
	 *   pollInterval: 500,  // Poll every 500ms
	 *   timeout: 120000,    // 2 minute timeout
	 * })
	 *
	 * // With cancellation
	 * const controller = new AbortController()
	 * setTimeout(() => controller.abort(), 10000) // Cancel after 10s
	 *
	 * try {
	 *   const proof = await client.waitForProof({
	 *     signal: controller.signal
	 *   })
	 * } catch (error) {
	 *   if (error.message.includes('cancelled')) {
	 *     console.log('User cancelled')
	 *   }
	 * }
	 * ```
	 */
	async waitForProof(options?: WaitOptions): Promise<ISuccessResult> {
		const pollInterval = options?.pollInterval ?? 1000
		const timeout = options?.timeout ?? 300000 // 5 minutes default
		const startTime = Date.now()

		while (true) {
			// Check for cancellation
			if (options?.signal?.aborted) {
				throw new Error('Verification cancelled')
			}

			// Check timeout
			if (Date.now() - startTime > timeout) {
				throw new Error(`Timeout waiting for proof after ${timeout}ms`)
			}

			// Poll status
			const status = await this.pollOnce()

			if (status.type === 'confirmed' && status.proof) {
				return status.proof
			}

			if (status.type === 'failed') {
				const errorCode = status.error ?? AppErrorCodes.GenericError
				throw new Error(`Verification failed: ${errorCode}`)
			}

			// Wait before next poll
			await new Promise(resolve => setTimeout(resolve, pollInterval))
		}
	}

	/**
	 * Poll once for current status (for manual polling)
	 *
	 * Use this if you want to implement your own polling logic instead of
	 * using waitForProof().
	 *
	 * @returns Current status of the verification
	 *
	 * @example
	 * ```typescript
	 * // Manual polling loop
	 * while (true) {
	 *   const status = await client.pollOnce()
	 *
	 *   if (status.type === 'awaiting_confirmation') {
	 *     console.log('Waiting for user...')
	 *   } else if (status.type === 'confirmed') {
	 *     console.log('Success!', status.proof)
	 *     break
	 *   } else if (status.type === 'failed') {
	 *     console.error('Failed:', status.error)
	 *     break
	 *   }
	 *
	 *   await new Promise(resolve => setTimeout(resolve, 1000))
	 * }
	 * ```
	 */
	async pollOnce(): Promise<Status> {
		return (await this.session.pollForStatus()) as Status
	}
}
