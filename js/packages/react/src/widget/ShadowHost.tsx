import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ShadowHostProps = {
  children: ReactNode;
};

export function ShadowHost({ children }: ShadowHostProps): ReactElement | null {
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.setAttribute("data-idkit-shadow-host", "true");
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: "open" });
    setRoot(shadowRoot);

    return () => {
      host.remove();
      setRoot(null);
    };
  }, []);

  if (!root) {
    return null;
  }

  return createPortal(children, root);
}
