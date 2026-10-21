import type { ReactElement } from "react";
import { __ } from "../../lang";
import { useMedia } from "../../hooks/useMedia";
import { WorldIDBadgeIcon } from "../Icons/WorldIDBadgeIcon";
import { LoadingIcon } from "../Icons/LoadingIcon";
import { QRState } from "./QRState";

type WorldIDStateProps = {
  connectorURI: string | null;
  isAwaitingUserConfirmation: boolean;
  showSimulatorCallout?: boolean;
};

export function WorldIDState({
  connectorURI,
  isAwaitingUserConfirmation,
  showSimulatorCallout,
}: WorldIDStateProps): ReactElement {
  const media = useMedia();

  return (
    <div className="idkit-worldid-state">
      {/* Verified-human badge */}
      {media === "desktop" && (
        <div className="idkit-worldid-icon idkit-worldid-icon--large">
          <WorldIDBadgeIcon />
        </div>
      )}

      <div className="idkit-instructions">
        <h2 className={media === "mobile" ? "headline-h3" : "headline-h2"}>
          {__("Connect your World ID")}
        </h2>
        <p className="body-b1">
          {media === "mobile"
            ? __(
                "You will be redirected to the app, please return to this page once you're done",
              )
            : __("Use phone camera to scan the QR code")}
        </p>
      </div>

      {/* QR Container */}
      <div className="idkit-qr-container">
        {isAwaitingUserConfirmation && (
          <div className="idkit-qr-overlay">
            <div className="idkit-spinner">
              <LoadingIcon />
            </div>
            <div className="idkit-connecting-text">
              <p>{__("Connecting...")}</p>
              <p>{__("Please continue in app")}</p>
            </div>
          </div>
        )}

        <div
          className={`idkit-qr-blur ${isAwaitingUserConfirmation ? "blurred" : ""}`}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <QRState
              qrData={connectorURI}
              showSimulatorCallout={showSimulatorCallout}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
