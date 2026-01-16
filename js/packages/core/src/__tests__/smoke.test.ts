/**
 * Smoke tests to ensure basic functionality works
 * These tests verify that the WASM integration and core APIs are functional
 */

import { describe, it, expect } from 'vitest'
import {
	initIDKit,
	isInitialized,
	createSession,
	hashToField,
	solidityEncode,
	buffer_encode,
	buffer_decode,
	isNode,
	AppErrorCodes,
	VerificationState,
} from '../index'

describe('WASM Initialization', () => {
	it('should initialize WASM via initIDKit', async () => {
		// Call initIDKit to mark as initialized in our wrapper
		await initIDKit()
		expect(isInitialized()).toBe(true)
	})

	it('should be safe to call initIDKit multiple times', async () => {
		await initIDKit()
		await initIDKit()
		expect(isInitialized()).toBe(true)
	})
})

describe('Hashing Functions', () => {
	// WASM already initialized in setup.ts

	it('should hash string to field', () => {
		const result = hashToField('test-signal')
		expect(result.digest).toMatch(/^0x[0-9a-f]{64}$/i)
		expect(typeof result.hash).toBe('bigint')
	})

	it('should hash Uint8Array to field', () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5])
		const result = hashToField(bytes)
		expect(result.digest).toMatch(/^0x[0-9a-f]{64}$/i)
		expect(typeof result.hash).toBe('bigint')
	})

	it('should produce consistent hashes', () => {
		const input = 'consistent-signal'
		const hash1 = hashToField(input)
		const hash2 = hashToField(input)
		expect(hash1.digest).toBe(hash2.digest)
		expect(hash1.hash).toBe(hash2.hash)
	})

	it('should hash empty string', () => {
		const result = hashToField('')
		expect(result.digest).toMatch(/^0x[0-9a-f]{64}$/i)
	})
})

describe('Buffer Utilities', () => {
	it('should encode ArrayBuffer to base64', () => {
		const buffer = new ArrayBuffer(8)
		const view = new Uint8Array(buffer)
		view.set([1, 2, 3, 4, 5, 6, 7, 8])

		const encoded = buffer_encode(buffer)
		expect(typeof encoded).toBe('string')
		expect(encoded.length).toBeGreaterThan(0)
	})

	it('should decode base64 to ArrayBuffer', () => {
		const original = 'SGVsbG8gV29ybGQh' // "Hello World!" in base64
		const decoded = buffer_decode(original)

		expect(decoded).toBeInstanceOf(ArrayBuffer)
		const text = new TextDecoder().decode(decoded)
		expect(text).toBe('Hello World!')
	})

	it('should round-trip encode/decode', () => {
		const buffer = new ArrayBuffer(16)
		const view = new Uint8Array(buffer)
		for (let i = 0; i < 16; i++) {
			view[i] = i * 2
		}

		const encoded = buffer_encode(buffer)
		const decoded = buffer_decode(encoded)
		const decodedView = new Uint8Array(decoded)

		expect(decoded.byteLength).toBe(buffer.byteLength)
		for (let i = 0; i < 16; i++) {
			expect(decodedView[i]).toBe(view[i])
		}
	})
})

describe('ABI Encoding', () => {
	it('should encode solidity types', () => {
		const encoded = solidityEncode(['uint256', 'address'], [123, '0x1234567890123456789012345678901234567890'])

		expect(encoded).toHaveProperty('types')
		expect(encoded).toHaveProperty('values')
		expect(encoded.types).toEqual(['uint256', 'address'])
		expect(encoded.values).toHaveLength(2)
	})

	it('should throw on mismatched types and values', () => {
		expect(() => {
			solidityEncode(['uint256', 'address'], [123])
		}).toThrow('Types and values arrays must have the same length')
	})
})

describe('Platform Detection', () => {
	it('should detect Node.js environment', () => {
		expect(isNode()).toBe(true)
		// Note: isWeb() returns true in test env because vitest provides window object
	})
})

describe('Session API', () => {
	it('should export createSession function', () => {
		expect(typeof createSession).toBe('function')
	})

	it('should throw error when requests is empty', async () => {
		await expect(
			createSession({
				app_id: 'app_staging_test',
				action: 'test-action',
				requests: [],
			})
		).rejects.toThrow('At least one request is required')
	})
})

describe('Enums', () => {
	it('should export AppErrorCodes enum', () => {
		expect(AppErrorCodes.ConnectionFailed).toBe('connection_failed')
		expect(AppErrorCodes.VerificationRejected).toBe('verification_rejected')
		expect(AppErrorCodes.CredentialUnavailable).toBe('credential_unavailable')
	})

	it('should export VerificationState enum', () => {
		expect(VerificationState.PreparingClient).toBe('loading_widget')
		expect(VerificationState.WaitingForConnection).toBe('awaiting_connection')
		expect(VerificationState.WaitingForApp).toBe('awaiting_app')
		expect(VerificationState.Confirmed).toBe('confirmed')
		expect(VerificationState.Failed).toBe('failed')
	})
})

describe('Type Safety', () => {
	it('should enforce app_id format at type level', () => {
		// This is a compile-time check, but we can verify the type exists
		const validAppId: `app_${string}` = 'app_staging_123'
		expect(validAppId).toBe('app_staging_123')

		// TypeScript would error on this: const invalid: `app_${string}` = 'invalid'
	})
})
