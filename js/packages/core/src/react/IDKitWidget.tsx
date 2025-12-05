import React, { useEffect, useMemo, useState } from 'react'
import { useWorldBridgeStore, type WorldBridgeStore, VerificationState, AppErrorCodes } from '../'
import type { WidgetProps, WidgetStatus } from './types'

const STATUS_MAP: Record<VerificationState, WidgetStatus> = {
  [VerificationState.PreparingClient]: 'preparing',
  [VerificationState.WaitingForConnection]: 'waiting',
  [VerificationState.WaitingForApp]: 'waiting_for_app',
  [VerificationState.Confirmed]: 'success',
  [VerificationState.Failed]: 'error',
}

const PollInterval = 2500

export const IDKitWidget: React.FC<WidgetProps> = ({
  children,
  show_modal = true,
  onSuccess,
  handleVerify,
  onError,
  autoClose = true,
  ...config
}) => {
  const { connectorURI, verificationState, createClient, pollForUpdates, result, errorCode, reset } = useWorldBridgeStore() as WorldBridgeStore
  const [open, setOpen] = useState(false)
  const [localError, setLocalError] = useState<AppErrorCodes | null>(null)

  const status: WidgetStatus = useMemo(() => STATUS_MAP[verificationState] ?? 'idle', [verificationState])

  // Start session when opened
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        await createClient(config)
      } catch (err) {
        if (cancelled) return
        setLocalError(AppErrorCodes.UnexpectedResponse)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, createClient, config])

  // Poll while waiting
  useEffect(() => {
    if (!open) return
    if (verificationState === VerificationState.PreparingClient) return
    if (verificationState === VerificationState.Confirmed || verificationState === VerificationState.Failed) return

    const id = setInterval(() => {
      void pollForUpdates()
    }, PollInterval)
    return () => clearInterval(id)
  }, [open, verificationState, pollForUpdates])

  // Handle result
  useEffect(() => {
    if (!result) return
    let cancelled = false
    ;(async () => {
      try {
        if (handleVerify) await handleVerify(result)
        await onSuccess(result)
        if (autoClose && !cancelled) {
          setOpen(false)
          reset()
        }
      } catch (err) {
        if (cancelled) return
        const message = (err as Error)?.message
        onError?.({ code: AppErrorCodes.FailedByHostApp, message })
        setLocalError(AppErrorCodes.FailedByHostApp)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [result, handleVerify, onSuccess, autoClose, reset, onError])

  // Handle errors from bridge
  useEffect(() => {
    if (!errorCode) return
    onError?.({ code: errorCode })
    setLocalError(errorCode)
  }, [errorCode, onError])

  const trigger = children?.({
    open: () => {
      reset()
      setOpen(true)
    },
    status,
  })

  const body = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={() => {
        setOpen(false)
        reset()
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: '20px',
          borderRadius: '12px',
          minWidth: '320px',
          maxWidth: '440px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Verify with World ID</h3>
        {status === 'preparing' && <p>Preparing session…</p>}
        {status === 'waiting' && (
          <div>
            <p>Scan the QR code with World App to continue.</p>
            {connectorURI ? (
              <img
                alt="World ID QR"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(connectorURI)}`}
                style={{ display: 'block', margin: '12px auto' }}
              />
            ) : (
              <p>Generating connection link…</p>
            )}
            {connectorURI && (
              <p style={{ wordBreak: 'break-all', fontSize: 12, color: '#444' }}>
                {connectorURI}
              </p>
            )}
          </div>
        )}
        {status === 'waiting_for_app' && <p>Waiting for confirmation in World App…</p>}
        {status === 'success' && <p>Success! You can close this window.</p>}
        {status === 'error' && (
          <p style={{ color: 'crimson' }}>Something went wrong {localError ? `(${localError})` : ''}</p>
        )}
        <button
          style={{
            marginTop: 12,
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: 'none',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
          onClick={() => {
            setOpen(false)
            reset()
          }}
        >
          Close
        </button>
      </div>
    </div>
  )

  return (
    <>
      {trigger ?? (
        <button onClick={() => setOpen(true)} style={{ padding: '8px 12px' }}>
          Verify with World ID
        </button>
      )}
      {show_modal && open && body}
    </>
  )
}
