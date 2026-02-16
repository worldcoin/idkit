import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QRState } from "../components/States/QRState";

vi.mock("../../src/hooks/useMedia", () => ({
  useMedia: () => "desktop",
}));

vi.mock("../../src/widget/QRCode", () => ({
  QRCode: ({ data }: { data: string }) => <div data-testid="qr-code">{data}</div>,
}));

describe("QRState simulator callout", () => {
  const qrData = "https://worldcoin.org/verify?t=wld_abc123";

  it("renders simulator link when showSimulatorCallout is true and qrData is present", () => {
    render(<QRState qrData={qrData} showSimulatorCallout={true} />);

    const link = screen.getByRole("link", { name: /use the simulator/i });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe(
      `https://simulator.worldcoin.org?connect_url=${encodeURIComponent(qrData)}`,
    );
  });

  it("has correct href with encoded connect_url param", () => {
    render(<QRState qrData={qrData} showSimulatorCallout={true} />);

    const link = screen.getByRole("link", { name: /use the simulator/i });
    const url = new URL(link.getAttribute("href")!);
    expect(url.searchParams.get("connect_url")).toBe(qrData);
  });

  it("opens link in new tab with noopener noreferrer", () => {
    render(<QRState qrData={qrData} showSimulatorCallout={true} />);

    const link = screen.getByRole("link", { name: /use the simulator/i });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not render callout when showSimulatorCallout is false", () => {
    render(<QRState qrData={qrData} showSimulatorCallout={false} />);

    expect(screen.queryByRole("link", { name: /use the simulator/i })).toBeNull();
  });

  it("does not render callout when qrData is null", () => {
    render(<QRState qrData={null} showSimulatorCallout={true} />);

    expect(screen.queryByRole("link", { name: /use the simulator/i })).toBeNull();
  });

  it("does not render callout when showSimulatorCallout is undefined", () => {
    render(<QRState qrData={qrData} />);

    expect(screen.queryByRole("link", { name: /use the simulator/i })).toBeNull();
  });
});
