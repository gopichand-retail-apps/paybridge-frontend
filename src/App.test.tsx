import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type SessionUser, type PaymentIntent } from "./api";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ContentProvider } from "./content";
import { useContent } from "./content-context";
import { IS_MOCK } from "./config";
import { contentModelSchema, dataStringAt } from "./content-schema";
import paybridgeModel from "../public/paybridge-model.json";

const merchantUser: SessionUser = {
  id: "user-merchant-01",
  displayName: "Alex Morgan",
  role: "MERCHANT",
  merchantId: "merchant-demo-01",
};

const auditorUser: SessionUser = {
  id: "user-auditor-01",
  displayName: "Sam Rivera",
  role: "AUDITOR",
  merchantId: null,
};

const paymentIntent: PaymentIntent = {
  id: "intent-demo-created",
  merchantId: "merchant-demo-01",
  merchantName: "Stale API merchant label",
  amountMinor: 12500,
  currency: "USD",
  description: "Stale API intent description",
  status: "CREATED",
  simulationOutcome: "APPROVE",
  capturedAmountMinor: 0,
  refundedAmountMinor: 0,
  webhookEventCount: 0,
  latestReconciliationResult: null,
  createdAt: "2026-10-30T12:00:00Z",
  updatedAt: "2026-10-30T12:00:00Z",
  authorizedAt: null,
  capturedAt: null,
};

function mockWorkspace(): void {
  vi.spyOn(api, "overview").mockResolvedValue({
    totalIntentCount: 1,
    capturedAmountMinor: 0,
    refundedAmountMinor: 0,
    awaitingAuthorizationCount: 1,
    declinedCount: 0,
    pendingWebhookCount: 0,
    reconciliationMismatchCount: 0,
    capturedIntentCount: 0,
    authorizedIntentCount: 0,
  });
  vi.spyOn(api, "payments").mockResolvedValue({
    paymentIntents: [paymentIntent],
  });
  vi.spyOn(api, "webhooks").mockResolvedValue({ webhookEvents: [] });
  vi.spyOn(api, "reconciliations").mockResolvedValue({ reconciliations: [] });
  vi.spyOn(api, "auditEvents").mockResolvedValue({ auditEvents: [] });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderApp(model: unknown = paybridgeModel) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(model) ?? "", { status: 200 }),
      ),
  );
  return render(
    <ContentProvider appId="paybridge" modelUrl="/paybridge-model.json">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ContentProvider>,
  );
}

function ContentProbe() {
  const { t } = useContent();
  return <p>{t("app.localProcessing")}</p>;
}

describe("PayBridge content model", () => {
  it("updates rendered copy and document locale from the served model", async () => {
    const localizedModel = {
      ...paybridgeModel,
      locale: "es-ES",
      messages: {
        ...paybridgeModel.messages,
        "app.localProcessing": "Procesamiento local",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(localizedModel), { status: 200 }),
        ),
    );

    render(
      <ContentProvider appId="paybridge" modelUrl="/paybridge-model.json">
        <ContentProbe />
      </ContentProvider>,
    );

    expect(await screen.findByText("Procesamiento local")).toBeVisible();
    expect(document.documentElement.lang).toBe("es-ES");
    expect(document.title).toBe(localizedModel.messages["meta.title"]);
  });

  it("keeps API profile roles separate from model-owned presentation labels", () => {
    const model = contentModelSchema.parse({
      ...paybridgeModel,
      data: { ...paybridgeModel.data, profiles: {} },
    });

    expect(() =>
      dataStringAt(model, "profiles", "merchant-northstar", "name"),
    ).toThrow("CONTENT_DATA_INVALID:profiles.merchant-northstar.name");
  });
});

describe("PayBridge workspace", () => {
  it("loads the merchant workspace and exposes payment creation", async () => {
    const user = userEvent.setup();
    const model = {
      ...paybridgeModel,
      data: {
        ...paybridgeModel.data,
        profiles: {
          "merchant-northstar": { name: "Model fixture profile" },
        },
      },
    };
    vi.spyOn(api, "csrf").mockResolvedValue(undefined);
    vi.spyOn(api, "currentUser").mockRejectedValue(
      new ApiError("Sign in to continue", 401, "AUTH_REQUIRED", "request-1"),
    );
    const profiles = vi.spyOn(api, "profiles").mockResolvedValue({
      accounts: [
        {
          id: "merchant-northstar",
          displayName: "Server catalog label",
          role: "MERCHANT",
        },
      ],
    });
    const login = vi
      .spyOn(api, "login")
      .mockResolvedValue({ user: merchantUser, localProfileSession: true });
    mockWorkspace();

    renderApp(model);
    expect(
      await screen.findByRole("heading", { name: "Open your workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Merchant · Model fixture profile" }),
    ).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-mode",
      IS_MOCK ? "mock" : "server",
    );
    expect(profiles).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: /continue to paybridge/i }),
    );

    expect(login).toHaveBeenCalledWith("merchant-northstar");
    expect(
      await screen.findByRole("heading", { name: "Overview" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "New payment intent" }),
    ).toBeEnabled();
    expect(screen.getByText("Local processing")).toBeVisible();
  });

  it("does not let sessionStorage override the build-time mode shown by the app", async () => {
    const storedMode = IS_MOCK ? "false" : "true";
    window.sessionStorage.setItem("isMock", storedMode);
    vi.spyOn(api, "csrf").mockResolvedValue(undefined);
    vi.spyOn(api, "currentUser").mockRejectedValue(
      new ApiError(
        "Sign in to continue",
        401,
        "AUTH_REQUIRED",
        "request-storage-mode",
      ),
    );
    const profiles = vi.spyOn(api, "profiles").mockResolvedValue({
      accounts: [{ id: "auditor", displayName: "Sam Rivera", role: "AUDITOR" }],
    });
    mockWorkspace();

    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Open your workspace" }),
    ).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-mode",
      IS_MOCK ? "mock" : "server",
    );
    expect(
      screen.getByRole("option", { name: "Auditor · Sam Rivera" }),
    ).toBeVisible();
    expect(profiles).toHaveBeenCalledTimes(1);
  });

  it("uses API-owned role choices and keeps workspace data on the API", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "csrf").mockResolvedValue(undefined);
    vi.spyOn(api, "currentUser").mockRejectedValue(
      new ApiError("Sign in to continue", 401, "AUTH_REQUIRED", "request-1"),
    );
    const profiles = vi.spyOn(api, "profiles").mockResolvedValue({
      accounts: [{ id: "auditor", displayName: "Sam Rivera", role: "AUDITOR" }],
    });
    const login = vi.spyOn(api, "login").mockResolvedValue({
      user: auditorUser,
      localProfileSession: true,
    });
    mockWorkspace();

    renderApp();
    expect(
      await screen.findByRole("option", { name: "Auditor · Sam Rivera" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Merchant · Alex Morgan" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-mode",
      IS_MOCK ? "mock" : "server",
    );
    expect(profiles).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /continue to paybridge/i }),
    );

    expect(login).toHaveBeenCalledWith("auditor");
    expect(
      await screen.findByRole("heading", { name: "Overview" }),
    ).toBeVisible();
    expect(api.overview).toHaveBeenCalled();
    expect(api.payments).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "New payment intent" }),
    ).not.toBeInTheDocument();
  });

  it("keeps auditor access read-only in the payment details view", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "csrf").mockResolvedValue(undefined);
    vi.spyOn(api, "currentUser").mockResolvedValue({
      user: auditorUser,
      localProfileSession: true,
    });
    mockWorkspace();

    renderApp();
    expect(
      await screen.findByRole("heading", { name: "Overview" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New payment intent" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open Online order · #1048" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Online order · #1048" }),
    ).toBeVisible();
    expect(screen.getAllByText("Northstar Goods")).toHaveLength(2);
    expect(
      screen.getByText("Auditors have read-only access to payment records."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Simulate authorization" }),
    ).not.toBeInTheDocument();
  });

  it("shows offline status and reloads workspace reads after reconnection", async () => {
    vi.spyOn(api, "csrf").mockResolvedValue(undefined);
    vi.spyOn(api, "currentUser").mockResolvedValue({
      user: auditorUser,
      localProfileSession: true,
    });
    mockWorkspace();

    renderApp();
    expect(
      await screen.findByRole("heading", { name: "Overview" }),
    ).toBeVisible();

    const offlineMessage =
      "Your device is offline. Displayed payment records may be out of date; refresh after reconnecting.";
    window.dispatchEvent(new Event("offline"));
    expect(await screen.findByText(offlineMessage)).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();

    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(offlineMessage)).not.toBeInTheDocument();
  });
});
