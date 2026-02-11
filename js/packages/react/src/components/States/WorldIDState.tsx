import type { ReactElement } from "react";
import { __ } from "../../lang";
import { useMedia } from "../../hooks/useMedia";
import { WorldcoinIcon } from "../Icons/WorldcoinIcon";
import { LoadingIcon } from "../Icons/LoadingIcon";
import { QRState } from "./QRState";

type WorldIDStateProps = {
  connectorURI: string | null;
  isAwaitingConfirmation: boolean;
};

export function WorldIDState({
  connectorURI,
  isAwaitingConfirmation,
}: WorldIDStateProps): ReactElement {
  const media = useMedia();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      {/* Worldcoin logo */}
      <div className="idkit-worldid-icon">
        <WorldcoinIcon />
      </div>

      {/* Heading */}
      <h2 className="idkit-heading">{__("Connect your World ID")}</h2>

      {/* Subtext: different for mobile vs desktop */}
      <p className="idkit-subtext">
        {media === "mobile"
          ? __(
              "You will be redirected to the app, please return to this page once you're done",
            )
          : __("Use phone camera to scan the QR code")}
      </p>

      {/* QR Container */}
      <div className="idkit-qr-container">
        {isAwaitingConfirmation && (
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
          className={`idkit-qr-blur ${isAwaitingConfirmation ? "blurred" : ""}`}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <QRState qrData={connectorURI} />
          </div>
        </div>
      </div>
    </div>
  );
}
