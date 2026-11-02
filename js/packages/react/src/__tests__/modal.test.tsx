import { StrictMode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WIDGET_STYLES from "../styles/widget.css?inline";
import { IDKitModal } from "../widget/IDKitModal";

const hosts = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>("[data-idkit-shadow-host]"),
  );

afterEach(cleanup);

describe("modal styles and lifecycle", () => {
  it("bundles fonts, themes, layout, states and responsive rules without CSS imports", () => {
    for (const rule of [
      "@font-face",
      ":host(.dark)",
      ".idkit-modal",
      ".headline-h2",
      ".headline-h3",
      ".body-b1",
      ".idkit-qr-container",
      ".idkit-error-message",
      "@media",
    ]) {
      expect(WIDGET_STYLES).toContain(rule);
    }
    expect(WIDGET_STYLES).not.toContain("@import");
  });

  it("keeps one scoped style across rerenders and cleans up on close and unmount", () => {
    const onOpenChange = vi.fn();
    const modal = (open: boolean, text = "Content") => (
      <StrictMode>
        <IDKitModal open={open} onOpenChange={onOpenChange}>
          <p>{text}</p>
        </IDKitModal>
      </StrictMode>
    );
    const view = render(modal(false));
    expect(hosts()).toHaveLength(0);

    view.rerender(modal(true));
    expect(hosts()).toHaveLength(1);
    const host = hosts()[0];
    const root = host.shadowRoot!;
    expect(
      root.querySelector(".idkit-modal-header > .idkit-close"),
    ).toBeTruthy();
    expect(
      root.querySelector(".idkit-modal-body > .idkit-content"),
    ).toBeTruthy();
    expect(
      root.querySelector(".idkit-modal-body > .idkit-footer"),
    ).toBeTruthy();
    const style = root.querySelector("style");
    expect(style?.textContent).toBe(WIDGET_STYLES);
    expect(document.head.querySelector("style")).toBeNull();

    view.rerender(modal(true, "Updated"));
    expect(hosts()[0]).toBe(host);
    expect(root.querySelectorAll("style")).toHaveLength(1);
    expect(root.querySelector("style")).toBe(style);
    expect(root.querySelector("p")?.textContent).toBe("Updated");

    fireEvent.click(root.querySelector(".idkit-modal")!);
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(root.querySelector(".idkit-close")!);
    fireEvent.click(root.querySelector(".idkit-backdrop")!);
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(onOpenChange.mock.calls).toEqual([[false], [false], [false]]);

    view.rerender(modal(false));
    expect(hosts()).toHaveLength(0);
    expect(host.isConnected).toBe(false);
    onOpenChange.mockClear();
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(onOpenChange).not.toHaveBeenCalled();

    view.rerender(modal(true));
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(host);
    expect(hosts()[0].shadowRoot?.querySelector("style")?.textContent).toBe(
      WIDGET_STYLES,
    );
    view.unmount();
    expect(hosts()).toHaveLength(0);
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("removes only the unmounted modal when two roots are open", () => {
    const first = render(
      <IDKitModal open onOpenChange={() => {}}>
        First
      </IDKitModal>,
    );
    const second = render(
      <IDKitModal open onOpenChange={() => {}}>
        Second
      </IDKitModal>,
    );
    expect(hosts()).toHaveLength(2);
    for (const host of hosts()) {
      expect(host.shadowRoot?.querySelectorAll("style")).toHaveLength(1);
    }
    first.unmount();
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0].shadowRoot?.textContent).toContain("Second");
    second.unmount();
    expect(hosts()).toHaveLength(0);
  });
});
