import type { IDKitConfig, ISuccessResult, IErrorState } from '../'

export type WidgetConfig = Pick<IDKitConfig, 'app_id' | 'action' | 'signal' | 'requests' | 'constraints' | 'bridge_url' | 'partner' | 'action_description'> & {
  /** Called when a proof is received and optionally validated by handleVerify */
  onSuccess: (result: ISuccessResult) => void | Promise<void>
  /** Called after proof is received but before success is shown; throw to surface an error to the user */
  handleVerify?: (result: ISuccessResult) => void | Promise<void>
  /** Called when the session errors or handleVerify rejects */
  onError?: (error: IErrorState) => void
  /** Auto-close overlay on success (default true) */
  autoClose?: boolean
}

export type WidgetProps = WidgetConfig & {
  children?: (helpers: { open: () => void; status: WidgetStatus }) => JSX.Element
  show_modal?: boolean
}

export type WidgetStatus = 'idle' | 'preparing' | 'waiting' | 'waiting_for_app' | 'success' | 'error'
