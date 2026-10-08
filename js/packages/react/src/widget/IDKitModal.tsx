import { useEffect, type ReactElement, type ReactNode } from "react";
import WIDGET_STYLES from "../styles/widget.css?inline";
import { ShadowHost } from "./ShadowHost";
import { XMarkIcon } from "../components/Icons/XMarkIcon";
import { __ } from "../lang";

type IDKitModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  headerContent?: ReactNode;
  closePosition?: "left" | "right";
};

function ModalContent({
  onOpenChange,
  children,
  headerContent,
  closePosition,
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
          <header
            className={`idkit-modal-header${closePosition === "left" ? " idkit-modal-header--close-left" : ""}`}
          >
            {headerContent && (
              <div className="idkit-modal-header-content">{headerContent}</div>
            )}
            <button
              type="button"
              className="idkit-close glass-container"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <XMarkIcon />
            </button>
          </header>

          <div className="idkit-modal-body">
            <main className="idkit-content">{children}</main>

            <footer className="idkit-footer">
              <a
                href="https://developer.world.org/privacy-statement"
                target="_blank"
                rel="noopener noreferrer"
              >
                {__("Terms & Privacy")}
              </a>
            </footer>
          </div>
        </section>
      </div>
    </>
  );
}

export function IDKitModal({
  open,
  onOpenChange,
  children,
  headerContent,
  closePosition = "right",
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
    <ModalContent
      onOpenChange={onOpenChange}
      headerContent={headerContent}
      closePosition={closePosition}
    >
      {children}
    </ModalContent>
  );

  return <ShadowHost>{content}</ShadowHost>;
}
