import type { ReactElement } from "react";
import { __ } from "../../lang";
import { HumanBadgeIcon } from "../Icons/HumanBadgeIcon";

export function SuccessState(): ReactElement {
  return (
    <div className="idkit-state-grid idkit-success-state">
      <div className="idkit-state-content">
        <div className="idkit-worldid-icon idkit-worldid-icon--large idkit-success-icon">
          <HumanBadgeIcon />
        </div>
        <div className="idkit-instructions">
          <h2 className="headline-h2">{__("All set!")}</h2>
          <p className="body-b1" style={{ maxWidth: 260 }}>
            {__("Your World ID is now connected")}
          </p>
        </div>
      </div>
    </div>
  );
}
