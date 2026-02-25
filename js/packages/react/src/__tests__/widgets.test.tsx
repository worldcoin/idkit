import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDKitErrorCodes } from "@worldcoin/idkit-core";
import { IDKitRequestWidget } from "../widget/IDKitRequestWidget";
import { IDKitSessionWidget } from "../widget/IDKitSessionWidget";
import type {
  IDKitRequestWidgetProps,
  IDKitSessionWidgetProps,
} from "../types";

const { useIDKitRequestMock, useIDKitSessionMock } = vi.hoisted(() => ({
  useIDKitRequestMock: vi.fn(),
  useIDKitSessionMock: vi.fn(),
}));

vi.mock("../hooks/useIDKitRequest", () => ({
  useIDKitRequest: useIDKitRequestMock,
}));

vi.mock("../hooks/useIDKitSession", () => ({
  useIDKitSession: useIDKitSessionMock,
}));

vi.mock("../widget/IDKitModal", () => ({
  IDKitModal: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
  }) => (open ? <div data-testid="idkit-modal">{children}</div> : null),
}));

const baseRpContext = {
  rp_id: "rp_abc",
  nonce: "nonce",
  created_at: 1,
  expires_at: 2,
  signature: "0x1234",
};

function createFlow<TResult>(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    open: vi.fn(),
    reset: vi.fn(),
    isAwaitingUserConnection: false,
    isAwaitingUserConfirmation: false,
    isSuccess: false,
    isError: false,
    connectorURI: null,
    result: null as TResult | null,
    errorCode: null as IDKitErrorCodes | null,
    ...overrides,
  };
}

function createRequestProps(
  overrides: Partial<IDKitRequestWidgetProps> = {},
): IDKitRequestWidgetProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    app_id: "app_test",
    action: "test-action",
    rp_context: baseRpContext,
    allow_legacy_proofs: false,
    preset: { type: "OrbLegacy" },
    ...overrides,
  };
}

function createSessionProps(
  overrides: Partial<IDKitSessionWidgetProps> = {},
): IDKitSessionWidgetProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    app_id: "app_test",
    rp_context: baseRpContext,
    preset: { type: "OrbLegacy" },
    ...overrides,
  };
}

describe("widgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("request widget throws when onSuccess is missing", () => {
    useIDKitRequestMock.mockReturnValue(createFlow());

    const props = createRequestProps({
      onSuccess: undefined,
    } as unknown as Partial<IDKitRequestWidgetProps>);

    expect(() => render(<IDKitRequestWidget {...props} />)).toThrow(
      "IDKitRequestWidget requires an onSuccess callback.",
    );
  });

  it("session widget throws when onSuccess is missing", () => {
    useIDKitSessionMock.mockReturnValue(createFlow());

    const props = createSessionProps({
      onSuccess: undefined,
    } as unknown as Partial<IDKitSessionWidgetProps>);

    expect(() => render(<IDKitSessionWidget {...props} />)).toThrow(
      "IDKitSessionWidget requires an onSuccess callback.",
    );
  });

  it("request widget calls onSuccess and auto-closes without handleVerify", async () => {
    vi.useFakeTimers();

    const flow = createFlow({
      isSuccess: true,
      result: { proof: "ok" },
    });
    useIDKitRequestMock.mockReturnValue(flow);

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <IDKitRequestWidget
        {...createRequestProps({ onSuccess, onError, onOpenChange })}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("request widget calls onError for flow failures", async () => {
    const flow = createFlow({
      isError: true,
      errorCode: IDKitErrorCodes.ConnectionFailed,
    });
    useIDKitRequestMock.mockReturnValue(flow);

    const onSuccess = vi.fn();
    const onError = vi.fn();

    render(<IDKitRequestWidget {...createRequestProps({ onSuccess, onError })} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(IDKitErrorCodes.ConnectionFailed);
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("request widget waits for handleVerify to resolve before calling onSuccess", async () => {
    const flow = createFlow({
      isSuccess: true,
      result: { proof: "ok" },
    });
    useIDKitRequestMock.mockReturnValue(flow);

    let resolveVerify = () => {};
    const handleVerify = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    const onSuccess = vi.fn();

    render(
      <IDKitRequestWidget
        {...createRequestProps({ onSuccess, handleVerify })}
      />,
    );

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText("Transmitting verification to host app. Please wait..."),
    ).toBeDefined();
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveVerify();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("All set!")).toBeDefined();
  });

  it("request widget shows generic error and emits FailedByHostApp when handleVerify rejects", async () => {
    const flow = createFlow({
      isSuccess: true,
      result: { proof: "ok" },
    });
    useIDKitRequestMock.mockReturnValue(flow);

    let rejectVerify = (_error?: unknown) => {};
    const handleVerify = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectVerify = reject;
        }),
    );
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <IDKitRequestWidget
        {...createRequestProps({
          onSuccess,
          onError,
          onOpenChange,
          handleVerify,
        })}
      />,
    );

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rejectVerify(new Error("verification failed"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(IDKitErrorCodes.FailedByHostApp);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("request widget retry clears host verification state and allows a successful second run", async () => {
    const firstFlow = createFlow({
      isSuccess: true,
      result: { proof: "first" },
    });
    const secondFlow = createFlow({
      isSuccess: true,
      result: { proof: "second" },
    });
    let currentFlow = firstFlow;
    useIDKitRequestMock.mockImplementation(() => currentFlow);

    const handleVerify = vi
      .fn()
      .mockRejectedValueOnce(new Error("verify failed"))
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const onSuccess = vi.fn();

    const props = createRequestProps({
      onSuccess,
      onError,
      handleVerify,
    });
    const { rerender } = render(<IDKitRequestWidget {...props} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(IDKitErrorCodes.FailedByHostApp);
    });

    currentFlow = secondFlow;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    rerender(<IDKitRequestWidget {...props} />);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ proof: "second" });
    });
    expect(handleVerify).toHaveBeenCalledTimes(2);
    expect(firstFlow.reset).toHaveBeenCalledTimes(1);
    expect(firstFlow.open).toHaveBeenCalledTimes(2);
  });

  it("request widget ignores stale handleVerify completion after close/reset", async () => {
    const flow = createFlow({
      isSuccess: true,
      result: { proof: "pending" },
    });
    useIDKitRequestMock.mockReturnValue(flow);

    let resolveVerify = () => {};
    const handleVerify = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const props = createRequestProps({ onSuccess, onError, handleVerify });
    const { rerender } = render(<IDKitRequestWidget {...props} />);

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledTimes(1);
    });

    rerender(<IDKitRequestWidget {...props} open={false} />);
    expect(flow.reset).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVerify();
      await Promise.resolve();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("session widget waits for handleVerify before calling onSuccess", async () => {
    const flow = createFlow({
      isSuccess: true,
      result: { session_id: "session_1", responses: [] },
    });
    useIDKitSessionMock.mockReturnValue(flow);

    let resolveVerify = () => {};
    const handleVerify = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    const onSuccess = vi.fn();

    render(
      <IDKitSessionWidget
        {...createSessionProps({ onSuccess, handleVerify })}
      />,
    );

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveVerify();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        session_id: "session_1",
        responses: [],
      });
    });
  });
});
