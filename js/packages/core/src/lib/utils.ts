import { CredentialType, VerificationLevel } from '../types/config'
import { WasmModule } from './wasm'

export const DEFAULT_VERIFICATION_LEVEL = VerificationLevel.Orb

/**
 * Converts verification level to accepted credential types for proof request
 * @param verification_level
 * @returns Array of credential types
 */
export const verification_level_to_credential_types = (verification_level: VerificationLevel): string[] => {
	switch (verification_level) {
		case VerificationLevel.Device:
			// Intentionally exclude document and secure document for backwards compatibility with older app versions
			return [CredentialType.Orb, CredentialType.Device]
		case VerificationLevel.Document:
			return [CredentialType.Document, CredentialType.SecureDocument, CredentialType.Orb]
		case VerificationLevel.SecureDocument:
			return [CredentialType.SecureDocument, CredentialType.Orb]
		case VerificationLevel.Orb:
			return [CredentialType.Orb]
		case VerificationLevel.Face:
			return [CredentialType.Face, CredentialType.Orb]
		default:
			throw new Error(`Unknown verification level: ${verification_level}`)
	}
}

/**
 * Converts credential type to verification level upon proof response
 * @param credential_type
 * @returns VerificationLevel
 */
export const credential_type_to_verification_level = (credential_type: CredentialType): VerificationLevel => {
	switch (credential_type) {
		case CredentialType.Orb:
			return VerificationLevel.Orb
		case CredentialType.Face:
			return VerificationLevel.Face
		case CredentialType.SecureDocument:
			return VerificationLevel.SecureDocument
		case CredentialType.Document:
			return VerificationLevel.Document
		case CredentialType.Device:
			return VerificationLevel.Device
		default:
			throw new Error(`Unknown credential_type: ${credential_type}`)
	}
}

/**
 * Encodes an ArrayBuffer to base64 string
 * @param buffer - ArrayBuffer to encode
 * @returns Base64 encoded string
 */
export const buffer_encode = (buffer: ArrayBuffer): string => {
	return WasmModule.base64Encode(new Uint8Array(buffer))
}

/**
 * Decodes a base64 string to ArrayBuffer
 * @param encoded - Base64 encoded string
 * @returns Decoded ArrayBuffer
 */
export const buffer_decode = (encoded: string): ArrayBuffer => {
	const uint8Array = WasmModule.base64Decode(encoded)
	// Create a new ArrayBuffer and copy the data
	const buffer = new ArrayBuffer(uint8Array.length)
	const view = new Uint8Array(buffer)
	view.set(uint8Array)
	return buffer
}
