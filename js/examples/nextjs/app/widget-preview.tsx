/// <reference path="../../../packages/react/src/assets.d.ts" />
/// <reference path="../../../packages/react/src/qrcode.d.ts" />

"use client";

import { useMemo, useState } from "react";
import {
  IDKitErrorCodes,
  type IDKitInviteCodeHookResult,
} from "@worldcoin/idkit";
import { IDKitWidgetBase } from "../../../packages/react/src/widget/IDKitWidgetBase";
import { IDKitInviteCodeWidgetBase } from "../../../packages/react/src/widget/IDKitInviteCodeWidgetBase";

type Preview = {
  label: string;
  state: "initial" | "connecting" | "host_verification" | "success" | "error";
  inviteCode?: boolean;
  placeholder?: boolean;
  errorCode?: IDKitErrorCodes;
};

const PREVIEWS: Preview[] = [
  { label: "QR / App handoff", state: "initial" },
  { label: "QR loading", state: "initial", placeholder: true },
  { label: "QR connecting", state: "connecting" },
  { label: "Invite code", state: "initial", inviteCode: true },
  { label: "Invite connecting", state: "connecting", inviteCode: true },
  { label: "Host verification", state: "host_verification" },
  { label: "Success", state: "success" },
  {
    label: "Generic error",
    state: "error",
    errorCode: IDKitErrorCodes.GenericError,
  },
  {
    label: "Already verified",
    state: "error",
    errorCode: IDKitErrorCodes.NullifierReplayed,
  },
  {
    label: "Request cancelled",
    state: "error",
    errorCode: IDKitErrorCodes.UserRejected,
  },
  {
    label: "Verification unavailable",
    state: "error",
    errorCode: IDKitErrorCodes.InvalidRpSignature,
  },
  {
    label: "Connection lost",
    state: "error",
    errorCode: IDKitErrorCodes.ConnectionFailed,
  },
  {
    label: "Verification declined",
    state: "error",
    errorCode: IDKitErrorCodes.FailedByHostApp,
  },
  {
    label: "Requirements not met",
    state: "error",
    errorCode: IDKitErrorCodes.IdentityAttributesNotMatched,
  },
  {
    label: "Presence check failed",
    state: "error",
    errorCode: IDKitErrorCodes.UserPresenceFailed,
  },
];

const noop = () => {};
const previewResult = { preview: true };
// Keep the loading screen visible until the designer closes it.
const pendingVerification = () => new Promise<void>(() => {});

export function WidgetPreview() {
  const [preview, setPreview] = useState(PREVIEWS[0]);
  const [open, setOpen] = useState(false);
  const flow = useMemo<IDKitInviteCodeHookResult<typeof previewResult>>(
    () => ({
      open: noop,
      reset: noop,
      isOpen: open,
      isInWorldApp: false,
      isAwaitingUserConnection: preview.state === "initial",
      isAwaitingUserConfirmation: preview.state === "connecting",
      isSuccess:
        preview.state === "success" || preview.state === "host_verification",
      isError: preview.state === "error",
      connectorURI: preview.placeholder
        ? null
        : "https://example.invalid/verify?c=ABC123&a=app_preview",
      codeExpiresAt: Math.floor(Date.now() / 1000) + 600,
      result: previewResult,
      errorCode: preview.errorCode ?? null,
      getDebugReport: () => undefined,
    }),
    [preview, open],
  );

  const props = {
    flow,
    open,
    onOpenChange: setOpen,
    onSuccess: noop,
    autoClose: false,
    handleVerify:
      preview.state === "host_verification" ? pendingVerification : undefined,
  };

  return (
    <section>
      <h2>Widget preview</h2>
      <p>
        Preview each screen without running a verification. Resize the window to
        see mobile or desktop layouts.
      </p>
      <div className="stack">
        {PREVIEWS.map((item) => (
          <button
            key={item.label}
            type="button"
            className="secondary"
            onClick={() => {
              setPreview(item);
              setOpen(true);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {preview.inviteCode ? (
        <IDKitInviteCodeWidgetBase {...props} />
      ) : (
        <IDKitWidgetBase {...props} showSimulatorCallout={false} />
      )}
    </section>
  );
}
