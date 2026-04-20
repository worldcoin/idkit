import { useEffect, useRef, type ReactElement } from "react";
import { __ } from "../../lang";
import { LoadingIcon } from "../Icons/LoadingIcon";

type Props = {
  onVerify: () => Promise<void> | void;
  onPass: () => void;
  onFail: () => void;
};

export function HostAppVerificationState({
  onVerify,
  onPass,
  onFail,
}: Props): ReactElement {
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    void Promise.resolve(onVerify())
      .then(() => onPass())
      .catch(() => onFail());
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
