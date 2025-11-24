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
const isHexString = (value: string): boolean => /^0x[0-9a-fA-F]*$/.test(value)

export function hashToField(input: string | Uint8Array): HashFunctionOutput {
	if (!isInitialized()) {
		throw new Error('IDKit WASM not initialized. Call initIDKit() first.')
	}

	if (typeof input === 'string') {
		const digest = isHexString(input)
			? (WasmModule.hashSignalBytes(hexToBytes(input)) as `0x${string}`)
			: (WasmModule.hashSignal(input) as `0x${string}`)
		return { hash: BigInt(digest), digest }
	}

	const digest = WasmModule.hashSignalBytes(input) as `0x${string}`
	const hash = BigInt(digest)

	return { hash, digest }
}

const textEncoder = new TextEncoder()

const hexToBytes = (value: string): Uint8Array => {
	const normalized = value.startsWith('0x') ? value.slice(2) : value
	if (normalized.length === 0) return new Uint8Array()
	if (normalized.length % 2 !== 0) {
		throw new Error('Hex strings must have an even length')
	}
	if (!/^[0-9a-fA-F]+$/.test(normalized)) {
		throw new Error('Invalid hex string')
	}

	const bytes = new Uint8Array(normalized.length / 2)
	for (let i = 0; i < normalized.length; i += 2) {
		bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16)
	}
	return bytes
}

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
	const result = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		result.set(chunk, offset)
		offset += chunk.length
	}
	return result
}

const toBigInt = (value: unknown): bigint => {
	if (typeof value === 'bigint') return value
	if (typeof value === 'number') return BigInt(value)
	if (typeof value === 'string') return BigInt(value)
	if (typeof value === 'object' && value !== null && 'toString' in value) {
		return BigInt((value as { toString(): string }).toString())
	}
	throw new Error(`Unsupported integer value type: ${typeof value}`)
}

const encodeUint = (value: unknown, bits: number): Uint8Array => {
	const n = toBigInt(value)
	if (n < 0n) throw new Error('Unsigned integer cannot be negative')

	const byteLen = bits / 8
	const out = new Uint8Array(byteLen)
	let tmp = n
	for (let i = byteLen - 1; i >= 0; i--) {
		out[i] = Number(tmp & 0xffn)
		tmp >>= 8n
	}
	if (tmp !== 0n) {
		throw new Error(`Value ${n} does not fit in uint${bits}`)
	}
	return out
}

const encodeInt = (value: unknown, bits: number): Uint8Array => {
	const n = toBigInt(value)
	const byteLen = bits / 8
	const max = (1n << BigInt(bits - 1)) - 1n
	const min = -(1n << BigInt(bits - 1))
	if (n > max || n < min) {
		throw new Error(`Value ${n} does not fit in int${bits}`)
	}

	let twos = n & ((1n << BigInt(bits)) - 1n)
	const out = new Uint8Array(byteLen)
	for (let i = byteLen - 1; i >= 0; i--) {
		out[i] = Number(twos & 0xffn)
		twos >>= 8n
	}
	return out
}

const encodeAddress = (value: unknown): Uint8Array => {
	if (typeof value !== 'string') {
		throw new Error('Address value must be a string')
	}
	const bytes = hexToBytes(value)
	if (bytes.length !== 20) {
		throw new Error('Address must be 20 bytes (40 hex chars)')
	}
	return bytes
}

const isBytesLike = (value: unknown): value is Uint8Array | ArrayBuffer => {
	return value instanceof Uint8Array || value instanceof ArrayBuffer
}

const encodeBytes = (value: unknown): Uint8Array => {
	if (typeof value === 'string') {
		return hexToBytes(value)
	}
	if (isBytesLike(value)) {
		return value instanceof Uint8Array ? value : new Uint8Array(value)
	}
	throw new Error('Bytes value must be a hex string or Uint8Array')
}

const encodeFixedBytes = (value: unknown, size: number): Uint8Array => {
	const bytes = encodeBytes(value)
	if (bytes.length !== size) {
		throw new Error(`bytes${size} value must be exactly ${size} bytes`)
	}
	return bytes
}

const encodeBool = (value: unknown): Uint8Array => {
	if (typeof value !== 'boolean') {
		throw new Error('Bool value must be a boolean')
	}
	return new Uint8Array([value ? 1 : 0])
}

const encodeString = (value: unknown): Uint8Array => {
	if (typeof value !== 'string') {
		throw new Error('String value must be a string')
	}
	return textEncoder.encode(value)
}

const encodeValue = (type: string, value: unknown): Uint8Array => {
	const arrayMatch = type.match(/^(.*)\[(\d*)\]$/)
	if (arrayMatch) {
		const [, base, length] = arrayMatch
		if (!Array.isArray(value)) {
			throw new Error(`Value for array type ${type} must be an array`)
		}

		if (length) {
			const expected = Number(length)
			if (value.length !== expected) {
				throw new Error(`Static array ${type} expects ${expected} elements, got ${value.length}`)
			}
		}

		const encoded = value.map((item) => encodeValue(base, item))
		return concatBytes(encoded)
	}

	const intMatch = type.match(/^u?int(\d+)?$/)
	if (intMatch) {
		const bits = Number(intMatch[1] ?? '256')
		if (bits % 8 !== 0 || bits === 0 || bits > 256) {
			throw new Error(`Invalid int width: ${bits}`)
		}
		return type.startsWith('u') ? encodeUint(value, bits) : encodeInt(value, bits)
	}

	const bytesMatch = type.match(/^bytes(\d+)?$/)
	if (bytesMatch) {
		if (!bytesMatch[1]) {
			return encodeBytes(value)
		}
		const size = Number(bytesMatch[1])
		if (size < 1 || size > 32) {
			throw new Error(`bytesN size must be between 1 and 32, got ${size}`)
		}
		return encodeFixedBytes(value, size)
	}

	switch (type) {
		case 'address':
			return encodeAddress(value)
		case 'bool':
			return encodeBool(value)
		case 'string':
			return encodeString(value)
		default:
			throw new Error(`Unsupported Solidity type: ${type}`)
	}
}

const abiEncodePacked = (input: [string, unknown][]): Uint8Array => {
	const encodedParts = input.map(([type, value]) => encodeValue(type, value))
	return concatBytes(encodedParts)
}

/**
 * Packs and encodes ABI values, then hashes them
 * @param input Array of [type, value] tuples
 * @returns Hash output
 */
export function packAndEncode(input: [string, unknown][]): HashFunctionOutput {
	const encoded = abiEncodePacked(input)
	return hashToField(encoded)
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
