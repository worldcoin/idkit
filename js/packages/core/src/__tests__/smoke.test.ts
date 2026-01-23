/**
 * Smoke tests to ensure basic functionality works
 * These tests verify that the WASM integration and core APIs are functional
 */

import { describe, it, expect } from 'vitest'
import {
	initIDKit,
	isInitialized,
	createSession,
	isNode,
	AppErrorCodes,
	VerificationState,
} from '../index'
import type { CredentialType } from '../index'

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

describe('Platform Detection', () => {
	it('should detect Node.js environment', () => {
		expect(isNode()).toBe(true)
		// Note: isWeb() returns true in test env because vitest provides window object
	})
})

describe('Session API', () => {
	//TODO: We should try to find a test with a signed payload to test full e2e
	// Helper to create a test RP context
	const createTestRpContext = () => ({
		rp_id: 'rp_test123456789abc',
		nonce: 'test-nonce-' + Date.now(),
		created_at: Math.floor(Date.now() / 1000),
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		signature: 'test-signature',
	})

	it('should export createSession function', () => {
		expect(typeof createSession).toBe('function')
	})

	it('should throw error when requests is empty', async () => {
		await expect(
			createSession({
				app_id: 'app_staging_test',
				action: 'test-action',
				requests: [],
				rp_context: createTestRpContext(),
			})
		).rejects.toThrow('At least one request is required')
	})

	it('should throw error when rp_context is missing', async () => {
		await expect(
			createSession({
				app_id: 'app_staging_test',
				action: 'test-action',
				requests: [{ credential_type: 'orb' }],
				// @ts-expect-error - testing missing rp_context
				rp_context: undefined,
			})
		).rejects.toThrow('rp_context is required')
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
