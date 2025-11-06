/**
 * Backend proof verification using the Developer Portal API
 *
 * Note: This function is intended for server-side use only.
 * It will throw an error if called in a browser environment.
 */

import { hashToField } from './hashing'
import type { ISuccessResult } from '../types/result'

export interface IVerifyResponse {
	success: boolean
	code?: string
	detail?: string
	attribute?: string | null
}

/**
 * Verifies a World ID proof using the Developer Portal API
 *
 * This function should only be called from server-side code (Node.js).
 * It will throw an error if called in a browser environment.
 *
 * @param proof - The proof received from the World App
 * @param app_id - Your application ID from the Developer Portal
 * @param action - The action identifier
 * @param signal - Optional signal data (must match what was used when creating the proof)
 * @param endpoint - Optional custom verification endpoint (defaults to Developer Portal)
 * @param headers - Optional additional headers to include in the request
 * @returns Promise resolving to verification response
 * @throws Error if called in browser environment
 *
 * @example
 * ```typescript
 * const result = await verifyCloudProof(
 *   proof,
 *   'app_staging_xxxxx',
 *   'vote',
 *   'proposal-123'
 * )
 *
 * if (result.success) {
 *   console.log('Proof verified!')
 * } else {
 *   console.error('Verification failed:', result.code, result.detail)
 * }
 * ```
 */
export async function verifyCloudProof(
	proof: ISuccessResult,
	app_id: `app_${string}`,
	action: string,
	signal?: string,
	endpoint?: URL | string,
	headers?: Record<string, string>
): Promise<IVerifyResponse> {
	// Check if running in browser
	const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

	if (isBrowser) {
		throw new Error('verifyCloudProof can only be used in the backend.')
	}

	const response = await fetch(endpoint ?? `https://developer.worldcoin.org/api/v2/verify/${app_id}`, {
		method: 'POST',
		headers: {
			...(headers ?? {}),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			...proof,
			action,
			signal_hash: hashToField(signal ?? '').digest,
		}),
	})

	if (response.ok) {
		return { success: true }
	} else {
		return { success: false, ...(await response.json()) } as IVerifyResponse
	}
}
