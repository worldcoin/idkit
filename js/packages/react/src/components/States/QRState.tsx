import { useCallback, useState, type ReactElement } from "react";
import { __ } from "../../lang";
import { useMedia } from "../../hooks/useMedia";
import { QRCode } from "../../widget/QRCode";
import { QRPlaceholderIcon } from "../Icons/QRPlaceholderIcon";
import { WorldcoinIcon } from "../Icons/WorldIcon";

type QRStateProps = {
  qrData: string | null;
  showSimulatorCallout?: boolean;
};

export function QRState({ qrData, showSimulatorCallout }: QRStateProps): ReactElement {
  const media = useMedia();
  const [copiedLink, setCopiedLink] = useState(false);

  const copyLink = useCallback(() => {
    if (!qrData) return;
    void navigator.clipboard.writeText(qrData);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [qrData]);

  return (
    <>
      {/* Mobile: deep-link button */}
      <div className="idkit-mobile-only">
        <a href={qrData ?? undefined} className="idkit-deeplink-btn">
          <WorldcoinIcon />
          <span>{__("Open World App")}</span>
        </a>
      </div>

      {/* Desktop: QR code */}
      <div className="idkit-desktop-only">
        <div
          className={`idkit-copy-toast ${copiedLink ? "visible" : "hidden"}`}
          style={{
            textAlign: "center",
            fontSize: "14px",
            color: "var(--idkit-text-secondary)",
          }}
        >
          <span>{__("QR Code copied")}</span>
        </div>
        <div className="idkit-qr-wrapper">
          <div className="idkit-qr-inner">
            {qrData ? (
              <div
                onClick={copyLink}
                onKeyDown={(e) => {
                  if (e.key === "Enter") copyLink();
                }}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <QRCode data={qrData} size={media === "mobile" ? 160 : 200} />
              </div>
            ) : (
              <div className="idkit-qr-placeholder">
                <QRPlaceholderIcon />
              </div>
            )}
          </div>
        </div>
        {showSimulatorCallout && qrData && (
          <p className="idkit-simulator-callout">
            Testing in staging?{" "}
            <a
              href={`https://simulator.worldcoin.org?connect_url=${encodeURIComponent(qrData)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Use the simulator
            </a>
          </p>
        )}
      </div>
    </>
  );
}
