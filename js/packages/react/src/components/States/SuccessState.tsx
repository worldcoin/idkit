import type { ReactElement } from "react";
import { __ } from "../../lang";
import { CheckIcon } from "../Icons/CheckIcon";

export function SuccessState(): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div className="idkit-success-icon">
        <CheckIcon />
      </div>
      <h2 className="idkit-heading">{__("All set!")}</h2>
      <p className="idkit-subtext" style={{ maxWidth: 260 }}>
        {__("Your World ID is now connected")}
      </p>
    </div>
  );
}
