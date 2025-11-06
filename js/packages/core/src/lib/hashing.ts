/**
 * Hashing utilities powered by WASM
 * Uses the same Keccak256 implementation as Swift/Kotlin for cross-platform consistency
 */

import type { IDKitConfig, AbiEncodedValue } from '../types/config'
import { WasmModule, isInitialized } from './wasm'

export interface HashFunctionOutput {
	hash: bigint
	digest: `0x${string}`
}

/**
 * Hashes an input using the keccak256 hashing function used across the World ID protocol
 * Uses WASM for cross-platform consistency with Swift/Kotlin implementations
 *
 * @param input String or Uint8Array to hash
 * @returns Hash output with bigint and hex digest
 */
export function hashToField(input: string | Uint8Array): HashFunctionOutput {
	if (!isInitialized()) {
		throw new Error('IDKit WASM not initialized. Call initIDKit() first.')
	}

	// Convert Uint8Array to hex string if needed
	let stringInput: string
	if (typeof input === 'string') {
		stringInput = input
	} else {
		// Convert bytes to hex string
		stringInput = Array.from(input)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('')
	}

	const digest = WasmModule.hashSignal(stringInput) as `0x${string}`
	const hash = BigInt(digest)

	return { hash, digest }
}

/**
 * Packs and encodes ABI values, then hashes them
 * @param input Array of [type, value] tuples
 * @returns Hash output
 */
export function packAndEncode(input: [string, unknown][]): HashFunctionOutput {
	// For now, we'll convert to string representation
	// TODO: Implement proper ABI encoding in WASM
	const packed = input.map(([type, value]) => `${type}:${value}`).join(',')
	return hashToField(packed)
}

/**
 * Encodes values using Solidity ABI encoding rules
 * @param types Array of Solidity type strings
 * @param values Array of values to encode
 * @returns ABI encoded value
 */
export const solidityEncode = (types: string[], values: unknown[]): AbiEncodedValue => {
	if (types.length !== values.length) {
		throw new Error('Types and values arrays must have the same length.')
	}

	return { types, values } as AbiEncodedValue
}

/**
 * Generates a signal hash from IDKitConfig signal
 * Handles both string signals and ABI-encoded signals
 * @param signal Signal from IDKitConfig
 * @returns Hash output
 */
export const generateSignal = (signal: IDKitConfig['signal']): HashFunctionOutput => {
	if (!signal || typeof signal === 'string') {
		return hashToField(signal ?? '')
	}

	return packAndEncode(signal.types.map((type, index) => [type, signal.values[index]]))
}

/**
 * Encodes an action for the bridge protocol
 * @param action Action from IDKitConfig
 * @returns Encoded action string
 */
export const encodeAction = (action: IDKitConfig['action']): string => {
	if (!action) return ''
	if (typeof action === 'string') return action

	return action.types.map((type, index) => `${type}(${action.values[index]})`).join(',')
}
