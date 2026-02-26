import { useEffect, type ReactElement } from "react";
import { __ } from "../../lang";
import { LoadingIcon } from "../Icons/LoadingIcon";

type Props = {
  onVerify: () => Promise<void> | void;
  onPass: () => void;
  onFail: () => void;
};

export function HostAppVerificationState({ onVerify, onPass, onFail }: Props): ReactElement {
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(onVerify())
      .then(() => { if (!cancelled) onPass(); })
      .catch(() => { if (!cancelled) onFail(); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
