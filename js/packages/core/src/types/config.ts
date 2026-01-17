declare const brand: unique symbol
type Brand<T, TBrand extends string> = T & { [brand]: TBrand }

export type AbiEncodedValue = Brand<{ types: string[]; values: unknown[] }, 'AbiEncodedValue'>

export type CredentialType = 'orb' | 'face' | 'secure_document' | 'document' | 'device'

/**
 * A single credential request
 */
export type RequestConfig = {
	/** The type of credential being requested */
	credential_type: CredentialType
	/** Optional signal string for cryptographic binding */
	signal?: AbiEncodedValue | string
	/** Optional ABI-encoded signal bytes (for on-chain use cases) */
	signal_bytes?: Uint8Array
	/** Whether face authentication is required (only valid for orb and face credentials) */
	face_auth?: boolean
}

export type IDKitConfig = {
	/** Unique identifier for the app verifying the action. This should be the app ID obtained from the Developer Portal. */
	app_id: `app_${string}`
	/** Identifier for the action the user is performing. Should be left blank for [Sign in with Worldcoin](https://docs.world.org/id/sign-in). */
	action: AbiEncodedValue | string
	/** The description of the specific action (shown to users in World App). Only recommended for actions created on-the-fly. */
	action_description?: string
	/** URL to a third-party bridge to use when connecting to the World App. Optional. */
	bridge_url?: string
	/** Credential requests - at least one required */
	requests: RequestConfig[]
	/** Optional constraints JSON (matches Rust Constraints any/all structure) */
	constraints?: unknown
}
