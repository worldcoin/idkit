import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QRState } from "../components/States/QRState";

vi.mock("../../src/hooks/useMedia", () => ({
  useMedia: () => "desktop",
}));

vi.mock("../../src/widget/QRCode", () => ({
  QRCode: ({ data }: { data: string }) => (
    <div data-testid="qr-code">{data}</div>
  ),
}));

describe("QRState simulator callout", () => {
  const qrData = "https://worldcoin.org/verify?t=wld_abc123";

  it("shows simulator link in staging with qrData", () => {
    render(<QRState qrData={qrData} showSimulatorCallout={true} />);
    expect(
      screen.getByRole("link", { name: /use the simulator/i }),
    ).toBeDefined();
  });

  it("hidden when not staging or no qrData", () => {
    const { unmount } = render(
      <QRState qrData={qrData} showSimulatorCallout={false} />,
    );
    expect(
      screen.queryByRole("link", { name: /use the simulator/i }),
    ).toBeNull();
    unmount();

    render(<QRState qrData={null} showSimulatorCallout={true} />);
    expect(
      screen.queryByRole("link", { name: /use the simulator/i }),
    ).toBeNull();
  });

  it("offers both app handoff and a QR fallback on smaller screens", () => {
    render(<QRState qrData={qrData} />);

    expect(
      screen
        .getByRole("link", { name: /open world app/i })
        .getAttribute("href"),
    ).toBe(qrData);
    expect(screen.getAllByTestId("qr-code")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /display qr code/i }));

    expect(
      screen
        .getByRole("button", { name: /hide qr code/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getAllByTestId("qr-code")).toHaveLength(2);
  });
});
