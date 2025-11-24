import { VerificationLevel } from '../types/config'
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
			return [VerificationLevel.Orb, VerificationLevel.Device]
		case VerificationLevel.Document:
			return [VerificationLevel.Document, VerificationLevel.SecureDocument, VerificationLevel.Orb]
		case VerificationLevel.SecureDocument:
			return [VerificationLevel.SecureDocument, VerificationLevel.Orb]
		case VerificationLevel.Orb:
			return [VerificationLevel.Orb]
		case VerificationLevel.Face:
			return [VerificationLevel.Face, VerificationLevel.Orb]
		default:
			throw new Error(`Unknown verification level: ${verification_level}`)
	}
}

/**
 * Converts credential type string to verification level upon proof response
 * @param credential_type
 * @returns VerificationLevel
 */
export const credential_type_to_verification_level = (credential_type: VerificationLevel | string): VerificationLevel => {
	if (!Object.values(VerificationLevel).includes(credential_type as VerificationLevel)) {
		throw new Error(`Unknown credential_type: ${credential_type}`)
	}

	return credential_type as VerificationLevel
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
