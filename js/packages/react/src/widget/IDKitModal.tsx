import { useEffect, type ReactElement, type ReactNode } from "react";
import { WIDGET_STYLES } from "../styles/widgetStyles";
import { ShadowHost } from "./ShadowHost";
import { XMarkIcon } from "../components/Icons/XMarkIcon";
import { __ } from "../lang";

type IDKitModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

function ModalContent({
  onOpenChange,
  children,
}: Omit<IDKitModalProps, "open">): ReactElement {
  return (
    <>
      <style>{WIDGET_STYLES}</style>
      <div
        className="idkit-backdrop"
        role="presentation"
        onClick={() => onOpenChange(false)}
      >
        <section
          className="idkit-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Close button */}
          <button
            type="button"
            className="idkit-close"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <XMarkIcon />
          </button>

          {/* Content area */}
          <div className="idkit-content">{children}</div>

          {/* Footer */}
          <footer className="idkit-footer">
            <a
              href="https://developer.world.org/privacy-statement"
              target="_blank"
              rel="noopener noreferrer"
            >
              {__("Terms & Privacy")}
            </a>
          </footer>
        </section>
      </div>
    </>
  );
}

export function IDKitModal({
  open,
  onOpenChange,
  children,
}: IDKitModalProps): ReactElement | null {
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onOpenChange, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const content = (
    <ModalContent onOpenChange={onOpenChange}>{children}</ModalContent>
  );

  return <ShadowHost>{content}</ShadowHost>;
}
