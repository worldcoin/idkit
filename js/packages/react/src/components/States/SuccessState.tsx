import type { ReactElement } from "react";
import { __ } from "../../lang";
import { HumanBadgeIcon } from "../Icons/HumanBadgeIcon";
import { useMedia } from "../../hooks/useMedia";

export function SuccessState(): ReactElement {
  const media = useMedia();
  return (
    <div className="idkit-state-grid idkit-success-state">
      <div className="idkit-state-content">
        {media === "desktop" && (
          <div className="idkit-worldid-icon idkit-worldid-icon--large idkit-success-icon">
            <HumanBadgeIcon />
          </div>
        )}
        <div className="idkit-instructions">
          <h2 className={media === "mobile" ? "headline-h3" : "headline-h2"}>
            {__("All set!")}
          </h2>
          <p className="body-b1 idkit-success-message">
            {__("Your World ID is now connected")}
          </p>
        </div>
      </div>
    </div>
  );
}
