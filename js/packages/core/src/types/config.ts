declare const brand: unique symbol
type Brand<T, TBrand extends string> = T & { [brand]: TBrand }

export type AbiEncodedValue = Brand<{ types: string[]; values: unknown[] }, 'AbiEncodedValue'>

export type CredentialType = 'orb' | 'face' | 'secure_document' | 'document' | 'device'

export enum VerificationLevel {
	Orb = 'orb',
	Face = 'face',
	SecureDocument = 'secure_document',
	Document = 'document',
	Device = 'device',
}

export type IDKitConfig = {
	/** Unique identifier for the app verifying the action. This should be the app ID obtained from the Developer Portal. */
	app_id: `app_${string}`
	/** Identifier for the action the user is performing. Should be left blank for [Sign in with Worldcoin](https://docs.world.org/id/sign-in). */
	action: AbiEncodedValue | string
	/** The description of the specific action (shown to users in World App). Only recommended for actions created on-the-fly. */
	action_description?: string
	/** Encodes data into a proof that must match when validating. Read more on the [On-chain section](https://docs.world.org/advanced/on-chain). */
	signal?: AbiEncodedValue | string
	/** URL to a third-party bridge to use when connecting to the World App. Optional. */
	bridge_url?: string
	/** The minimum required level of verification. Defaults to "orb". */
	verification_level?: VerificationLevel
	/** Optional explicit requests (takes precedence over verification_level) */
	requests?: Array<{
		credential_type: CredentialType
		signal?: AbiEncodedValue | string
		signal_bytes?: Uint8Array
		face_auth?: boolean
	}>
	/** Optional constraints JSON (matches Rust Constraints any/all structure) */
	constraints?: unknown
	/** Optional user-facing action description */
	action_description?: string
	/** Whether the app is a partner app and should allow deferred verification. Defaults to false. */
	partner?: boolean
}
