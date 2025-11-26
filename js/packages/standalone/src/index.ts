export * from '@worldcoin/idkit-core'
import {
	initIDKit,
	WorldBridgeClient,
	WasmModule,
	type ISuccessResult,
	type IDKitConfig,
	type CredentialType,
} from '@worldcoin/idkit-core'

type RequestConfig = {
	credential_type: CredentialType
	signal?: string
	signal_bytes?: Uint8Array
	face_auth?: boolean
}

type StandaloneOptions = {
	app_id: `app_${string}`
	action: IDKitConfig['action']
	requests: RequestConfig[]
	constraints?: unknown
	action_description?: string
	bridge_url?: string
	pollIntervalMs?: number
	container?: HTMLElement
	onSuccess?: (result: ISuccessResult) => void
	onError?: (error: Error) => void
	onStatus?: (status: string) => void
}

const injectStyles = () => {
	const id = 'idkit-standalone-styles'
	if (document.getElementById(id)) return
	const style = document.createElement('style')
	style.id = id
	style.textContent = `
		.idkit-standalone { font-family: system-ui, -apple-system, sans-serif; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; max-width: 360px; }
		.idkit-standalone button { width: 100%; padding: 12px; border: none; border-radius: 6px; background: #111; color: white; font-size: 15px; cursor: pointer; }
		.idkit-standalone button:disabled { background: #999; cursor: not-allowed; }
		.idkit-standalone .status { margin-top: 12px; font-size: 14px; color: #444; }
		.idkit-standalone .qr { margin-top: 12px; text-align: center; }
		.idkit-standalone .qr img { max-width: 220px; }
		.idkit-standalone .error { margin-top: 12px; color: #c00; font-size: 14px; }
		.idkit-standalone .success { margin-top: 12px; color: #0a8040; font-size: 14px; word-break: break-all; }
	`
	document.head.appendChild(style)
}

const qrcodeUrl = (data: string) =>
	`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`

export type StandaloneWidget = {
	start: () => Promise<void>
	destroy: () => void
}

/**
 * Create a lightweight standalone widget that drives IDKit core without React.
 */
export const createStandaloneWidget = (opts: StandaloneOptions): StandaloneWidget => {
	if (!opts.container) {
		opts.container = document.createElement('div')
		document.body.appendChild(opts.container)
	}

	injectStyles()

	const root = document.createElement('div')
	root.className = 'idkit-standalone'
	opts.container.appendChild(root)

	const button = document.createElement('button')
	button.textContent = 'Verify with World ID'

	const status = document.createElement('div')
	status.className = 'status'

	const qr = document.createElement('div')
	qr.className = 'qr'

	const error = document.createElement('div')
	error.className = 'error'

	const success = document.createElement('div')
	success.className = 'success'

	root.append(button, status, qr, error, success)

	let client: WorldBridgeClient | null = null
	let pollTimer: ReturnType<typeof setInterval> | null = null
	const pollInterval = opts.pollIntervalMs ?? 3000

	const setStatus = (text: string) => {
		status.textContent = text
		opts.onStatus?.(text)
	}

	const clearMessages = () => {
		status.textContent = ''
		error.textContent = ''
		success.textContent = ''
		qr.innerHTML = ''
	}

	const stopPolling = () => {
		if (pollTimer) clearInterval(pollTimer)
		pollTimer = null
	}

	const startPolling = () => {
		stopPolling()
		pollTimer = setInterval(async () => {
			if (!client) return
			const state = await client.pollOnce()
			if (state.type === 'awaiting_confirmation') {
				setStatus('Awaiting confirmation…')
			} else if (state.type === 'confirmed' && state.proof) {
				stopPolling()
				setStatus('Verified')
				success.textContent = JSON.stringify(state.proof)
				opts.onSuccess?.(state.proof)
			} else if (state.type === 'failed') {
				stopPolling()
				setStatus('Failed')
				const msg = state.error ?? 'Unknown error'
				error.textContent = msg
				opts.onError?.(new Error(msg))
			}
		}, pollInterval)
	}

	const start = async () => {
		try {
			button.disabled = true
			clearMessages()
			setStatus('Initializing…')

			await initIDKit()

			const session = (await WasmModule.Session.createWithRequests(
				opts.app_id,
				typeof opts.action === 'string' ? opts.action : JSON.stringify(opts.action),
				opts.requests,
				opts.constraints ?? null,
				opts.action_description ?? null,
				opts.bridge_url ?? null
			)) as InstanceType<typeof WasmModule.Session>

			client = new WorldBridgeClient(session as any)
			setStatus('Scan in World App')
			const url = client.connectorURI
			qr.innerHTML = `<img src="${qrcodeUrl(url)}" alt="World ID QR">`
			startPolling()
		} catch (e) {
			button.disabled = false
			stopPolling()
			const msg = e instanceof Error ? e.message : String(e)
			error.textContent = msg
			opts.onError?.(e as Error)
		}
	}

	button.onclick = () => {
		void start()
	}

	return {
		start: () => start(),
		destroy: () => {
			stopPolling()
			root.remove()
			client = null
		},
	}
}
