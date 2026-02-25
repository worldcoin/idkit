import type { ReactElement } from "react";
import { __ } from "../../lang";
import { LoadingIcon } from "../Icons/LoadingIcon";

export function HostAppVerificationState(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div className="idkit-spinner">
        <LoadingIcon />
      </div>
      <p className="idkit-subtext">
        {__("Transmitting verification to host app. Please wait...")}
      </p>
    </div>
  );
}
