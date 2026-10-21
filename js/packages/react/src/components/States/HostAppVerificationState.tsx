import { useEffect, useRef, type ReactElement } from "react";
import { __ } from "../../lang";
import { LoadingIcon } from "../Icons/LoadingIcon";

type Props = {
  onVerify: () => Promise<void> | void;
};

export function HostAppVerificationState({ onVerify }: Props): ReactElement {
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    void onVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="idkit-host-app-verification"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 24,
      }}
    >
      <div className="idkit-spinner">
        <LoadingIcon />
      </div>
      <p className="body-b1 idkit-host-app-message">
        {__("Transmitting verification to host app. Please wait...")}
      </p>
    </div>
  );
}
