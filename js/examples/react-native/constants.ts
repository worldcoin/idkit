import {
  orbLegacy,
  documentLegacy,
  secureDocumentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  type Preset,
} from "@worldcoin/idkit-react-native";

export const APP_ID = "app_d8bbd5341f16fb97a61e644b7e169c0e" as const;
export const RP_ID = "rp_7b4f23dd5fb2a826";
export const DEFAULT_ACTION = "test-action";
export const DEFAULT_SIGNAL = "signal";
export const RETURN_TO_URL = "idkithermesdemo://callback";
export const SIGNATURE_ENDPOINT =
  "https://idkit-js-example.vercel.app/api/rp-signature";
export const VERIFY_ENDPOINT =
  "https://idkit-js-example.vercel.app/api/verify-proof";

export type Environment = "production" | "staging";

export type FlowState =
  | "idle"
  | "fetching_signature"
  | "opening_world_app"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "verifying_proof"
  | "verified"
  | "failed";

export const FLOW_STATE_LABELS: Record<FlowState, string> = {
  idle: "Idle",
  fetching_signature: "Fetching RP signature",
  opening_world_app: "Opening World App",
  waiting_for_connection: "Waiting for connection",
  awaiting_confirmation: "Awaiting confirmation",
  verifying_proof: "Verifying proof",
  verified: "Verification complete",
  failed: "Failed",
};

export type PresetKey =
  | "orb_legacy"
  | "document_legacy"
  | "secure_document_legacy"
  | "device_legacy"
  | "selfie_check_legacy";

export type PresetOption = {
  key: PresetKey;
  label: string;
  description: string;
  build: (signal: string) => Preset;
};

export const PRESET_OPTIONS: PresetOption[] = [
  {
    key: "orb_legacy",
    label: "Orb Legacy",
    description: "Uniqueness proof with the orb legacy preset.",
    build: (signal) => orbLegacy({ signal }),
  },
  {
    key: "document_legacy",
    label: "Document Legacy",
    description: "Legacy document credential request.",
    build: (signal) => documentLegacy({ signal }),
  },
  {
    key: "secure_document_legacy",
    label: "Secure Document Legacy",
    description: "Secure document legacy credential request.",
    build: (signal) => secureDocumentLegacy({ signal }),
  },
  {
    key: "device_legacy",
    label: "Device Legacy",
    description: "Legacy device credential request.",
    build: (signal) => deviceLegacy({ signal }),
  },
  {
    key: "selfie_check_legacy",
    label: "Selfie Check Legacy",
    description: "Legacy selfie-check credential request.",
    build: (signal) => selfieCheckLegacy({ signal }),
  },
];
