import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
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
  open,
  onExited,
  onOpenChange,
  children,
  headerContent,
  closePosition,
}: IDKitModalProps & { onExited: () => void }): ReactElement {
  return (
    <>
      <style>{WIDGET_STYLES}</style>
      <div
        className={`idkit-backdrop${open ? "" : " idkit-backdrop--closing"}`}
        role="presentation"
        onClick={() => open && onOpenChange(false)}
      >
        <section
          className="idkit-modal"
          role="dialog"
          aria-modal="true"
          aria-hidden={!open || undefined}
          ref={(node) => {
            if (node) node.inert = !open;
          }}
          onAnimationEnd={(event) => {
            if (
              !open &&
              event.target === event.currentTarget &&
              (event.animationName === "idkit-scale-out" ||
                event.animationName === "idkit-slide-down")
            ) {
              onExited();
            }
          }}
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
              onClick={() => open && onOpenChange(false)}
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
  const [present, setPresent] = useState(open);
  const lastContent = useRef<Pick<
    IDKitModalProps,
    "children" | "headerContent" | "closePosition"
  > | null>(null);

  useEffect(() => {
    if (open) {
      lastContent.current = { children, headerContent, closePosition };
    } else if (!present) {
      lastContent.current = null;
    }
  }, [open, present, children, headerContent, closePosition]);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;

    // Fallback if animationend is suppressed; reopening cancels removal.
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => setPresent(false),
      reducedMotion ? 0 : 350,
    );
    return () => window.clearTimeout(timer);
  }, [open, present]);

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

  if ((!open && !present) || typeof document === "undefined") {
    return null;
  }

  // Keep the visible screen while the parent resets its flow on close.
  const visibleContent = open
    ? { children, headerContent, closePosition }
    : lastContent.current;

  const content = (
    <ModalContent
      open={open}
      onExited={() => setPresent(false)}
      onOpenChange={onOpenChange}
      headerContent={visibleContent?.headerContent}
      closePosition={visibleContent?.closePosition}
    >
      {visibleContent?.children}
    </ModalContent>
  );

  return <ShadowHost>{content}</ShadowHost>;
}
