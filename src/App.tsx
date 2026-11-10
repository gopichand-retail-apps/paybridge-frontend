import {
  Activity,
  ArrowUpRight,
  Banknote,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import {
  api,
  ApiError,
  type CreateIntentRequest,
  type WorkspaceProfile,
  type SessionUser,
  type PaymentIntent,
  type PaymentStatus,
  type Reconciliation,
  type WebhookEvent,
} from "./api";
import { IS_MOCK } from "./config";
import { APP_VERSION } from "./app-version";
import "./paybridge.css";
import {
  AuditEventsTable,
  ReconciliationTable,
  WebhookEventsTable,
} from "./components/OperationsTables";
import { WorkspaceSignIn } from "./components/WorkspaceSignIn";
import { NewPaymentDialog } from "./components/NewPaymentDialog";
import {
  PaymentDetailsDrawer,
  type PaymentAction,
} from "./components/PaymentDetailsDrawer";
import { PaymentTable } from "./components/PaymentTable";
import { formatMoney } from "./domain/money";
import { useContent } from "./content-context";
import { loadWorkspaceProfiles } from "./profile-source";
import {
  dataString,
  dataStringFrom,
  errorMessage as resolveErrorMessage,
} from "./content-schema";

type WorkspacePage =
  "overview" | "payments" | "webhooks" | "reconciliation" | "audit";
type Toast = { message: string; kind: "success" | "error" };
type WorkspaceData = {
  overview: Awaited<ReturnType<typeof api.overview>>;
  payments: PaymentIntent[];
  webhooks: WebhookEvent[];
  reconciliations: Reconciliation[];
  auditEvents: Awaited<ReturnType<typeof api.auditEvents>>["auditEvents"];
};

const NAV_ITEMS: Array<{ id: WorkspacePage; key: string; icon: LucideIcon }> = [
  { id: "overview", key: "navigation.overview", icon: LayoutDashboard },
  { id: "payments", key: "navigation.payments", icon: CreditCard },
  { id: "webhooks", key: "navigation.webhooks", icon: Webhook },
  { id: "reconciliation", key: "navigation.reconciliation", icon: FileCheck2 },
  { id: "audit", key: "navigation.audit", icon: ClipboardList },
];

const PAGE_TITLES: Record<WorkspacePage, string> = {
  overview: "page.overview.title",
  payments: "page.payments.title",
  webhooks: "page.webhooks.title",
  reconciliation: "page.reconciliation.title",
  audit: "page.audit.title",
};

async function fetchWorkspaceData(): Promise<WorkspaceData> {
  const [overview, payments, webhooks, reconciliations, auditEvents] =
    await Promise.all([
      api.overview(),
      api.payments({ limit: 100 }),
      api.webhooks(),
      api.reconciliations(),
      api.auditEvents(),
    ]);

  return {
    overview,
    payments: payments.paymentIntents,
    webhooks: webhooks.webhookEvents,
    reconciliations: reconciliations.reconciliations,
    auditEvents: auditEvents.auditEvents,
  };
}

function errorMessage(
  cause: unknown,
  model: ReturnType<typeof useContent>["model"],
  t: ReturnType<typeof useContent>["t"],
): string {
  return resolveErrorMessage(model, t, cause);
}

function App() {
  const { model, t } = useContent();
  const isMock = IS_MOCK;
  const [accounts, setAccounts] = useState<WorkspaceProfile[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [page, setPage] = useState<WorkspacePage>("overview");
  const [selectedPayment, setSelectedPayment] = useState<PaymentIntent | null>(
    null,
  );
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "ALL">(
    "ALL",
  );
  const [isBooting, setIsBooting] = useState(true);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<PaymentAction | "refund" | null>(
    null,
  );
  const [pageError, setPageError] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const canCreateIntent = user?.role === "MERCHANT";
  const userDisplayName = user
    ? dataStringFrom(model, "userNames", user.id)
    : "";

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await api.csrf();
        try {
          const session = await api.currentUser();
          if (!active) return;
          setUser(session.user);
          setWorkspace(await fetchWorkspaceData());
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
          const profiles = await loadWorkspaceProfiles();
          if (active) setAccounts(profiles);
        }
      } catch (cause) {
        if (active) setPageError(errorMessage(cause, model, t));
      } finally {
        if (active) setIsBooting(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [isMock, model, t]);

  useEffect(() => {
    let active = true;
    const handleOffline = () => setOffline(true);
    const handleOnline = () => {
      setOffline(false);
      if (!user) return;
      setIsRefreshing(true);
      void fetchWorkspaceData()
        .then((data) => {
          if (!active) return;
          setWorkspace(data);
          setSelectedPayment((current) =>
            current
              ? data.payments.find((payment) => payment.id === current.id) ??
                null
              : null,
          );
          setPageError("");
        })
        .catch((cause: unknown) => {
          if (active) setPageError(errorMessage(cause, model, t));
        })
        .finally(() => {
          if (active) setIsRefreshing(false);
        });
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      active = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [model, t, user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!user || page !== "payments") return;
    let active = true;
    void api
      .payments({
        q: deferredSearch,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        limit: 100,
      })
      .then((response) => {
        if (active) {
          setWorkspace((current) =>
            current
              ? { ...current, payments: response.paymentIntents }
              : current,
          );
        }
      })
      .catch((cause: unknown) => {
        if (active) setPageError(errorMessage(cause, model, t));
      });

    return () => {
      active = false;
    };
  }, [deferredSearch, model, page, statusFilter, t, user]);

  async function refreshWorkspace(): Promise<WorkspaceData> {
    const next = await fetchWorkspaceData();
    setWorkspace(next);
    setPageError("");
    return next;
  }

  async function handleLogin(accountId: string): Promise<void> {
    setIsLoggingIn(true);
    setPageError("");
    try {
      const session = await api.login(accountId);
      const data = await fetchWorkspaceData();
      setUser(session.user);
      setWorkspace(data);
      setPage("overview");
      setToast({
        message: t("app.welcome", {
          role: t(`role.${session.user.role}`).toLowerCase(),
        }),
        kind: "success",
      });
    } catch (cause) {
      setPageError(errorMessage(cause, model, t));
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await api.logout();
      await api.csrf();
      setAccounts(await loadWorkspaceProfiles());
      setUser(null);
      setWorkspace(null);
      setSelectedPayment(null);
      setPage("overview");
      setToast(null);
    } catch (cause) {
      setToast({ message: errorMessage(cause, model, t), kind: "error" });
    }
  }

  async function handleRefresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      const data = await refreshWorkspace();
      if (selectedPayment) {
        setSelectedPayment(
          data.payments.find((payment) => payment.id === selectedPayment.id) ??
            null,
        );
      }
      setToast({ message: t("app.refreshed"), kind: "success" });
    } catch (cause) {
      setPageError(errorMessage(cause, model, t));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateIntent(
    request: CreateIntentRequest,
    idempotencyKey: string,
  ): Promise<void> {
    setIsCreatingIntent(true);
    setCreationError("");
    try {
      const response = await api.createIntent(request, idempotencyKey);
      await refreshWorkspace();
      setSelectedPayment(response.paymentIntent);
      setShowNewPayment(false);
      setToast({
        message: t(
          response.duplicate ? "app.duplicateIntent" : "app.intentCreated",
        ),
        kind: "success",
      });
    } catch (cause) {
      setCreationError(errorMessage(cause, model, t));
    } finally {
      setIsCreatingIntent(false);
    }
  }

  async function handlePaymentAction(action: PaymentAction): Promise<void> {
    if (!selectedPayment) return;
    setBusyAction(action);
    setDrawerError("");
    try {
      const idempotencyKey = crypto.randomUUID();
      if (action === "authorize") {
        await api.authorize(selectedPayment.id, idempotencyKey);
      } else if (action === "capture") {
        await api.capture(selectedPayment.id, idempotencyKey);
      } else if (action === "void") {
        await api.void(selectedPayment.id, idempotencyKey);
      } else if (action === "deliver") {
        await api.deliverWebhooks(selectedPayment.id);
      } else {
        await api.reconcile(selectedPayment.id, idempotencyKey);
      }

      const data = await refreshWorkspace();
      setSelectedPayment(
        data.payments.find((payment) => payment.id === selectedPayment.id) ??
          null,
      );
      setToast({ message: t(`app.action.${action}`), kind: "success" });
    } catch (cause) {
      setDrawerError(errorMessage(cause, model, t));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRefund(
    amountMinor: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    if (!selectedPayment) return;
    setBusyAction("refund");
    setDrawerError("");
    try {
      await api.refund(selectedPayment.id, amountMinor, reason, idempotencyKey);
      const data = await refreshWorkspace();
      setSelectedPayment(
        data.payments.find((payment) => payment.id === selectedPayment.id) ??
          null,
      );
      setToast({ message: t("app.refundRecorded"), kind: "success" });
    } finally {
      setBusyAction(null);
    }
  }

  if (isBooting) {
    return (
      <main
        className="boot-screen"
        data-mode={isMock ? "mock" : "server"}
        aria-live="polite"
      >
        <span className="brand-mark">
          <CreditCard aria-hidden="true" size={21} />
        </span>
        <LoaderCircle aria-hidden="true" className="spin" size={20} />
        <p>{t("app.loading")}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <WorkspaceSignIn
          accounts={accounts}
          error={pageError}
          busy={isLoggingIn}
          isMock={isMock}
          offlineNotice={
            offline ? (
              <OfflineNotice onRetry={() => window.location.reload()} />
            ) : null
          }
          onLogin={handleLogin}
        />
        {accounts.length === 0 && pageError && (
          <div className="login-retry">
            <button
              className="secondary-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} />{" "}
              {t("app.retryConnection")}
            </button>
          </div>
        )}
      </>
    );
  }

  if (!workspace) {
    return (
      <main className="connection-error" data-mode={isMock ? "mock" : "server"}>
        <span className="brand-mark">
          <CreditCard aria-hidden="true" size={21} />
        </span>
        <TriangleAlert aria-hidden="true" size={23} />
        <h1>{t("app.workspaceUnavailable")}</h1>
        <p role="alert">
          {pageError || t("app.workspaceUnavailableDescription")}
        </p>
        <button
          className="primary-button"
          onClick={() => void handleRefresh()}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} /> {t("app.tryAgain")}
        </button>
      </main>
    );
  }

  const currentPageTitle = t(PAGE_TITLES[page]);

  return (
    <div className="app-shell" data-mode={isMock ? "mock" : "server"}>
      <aside className="sidebar">
        <a
          aria-label={t("navigation.home")}
          className="brand-lockup"
          href="#overview"
          onClick={(event) => {
            event.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-mark">
            <CreditCard aria-hidden="true" size={20} />
          </span>
          <span className="brand-name">{t("brand.name")}</span>
        </a>
        <div className="sidebar-label">{t("app.sidebarLabel")}</div>
        <nav aria-label={t("app.primaryNavigation")} className="side-nav">
          {NAV_ITEMS.map(({ id, key, icon: Icon }) => (
            <button
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "nav-item is-active" : "nav-item"}
              key={id}
              onClick={() => setPage(id)}
              type="button"
            >
              <Icon aria-hidden="true" size={18} />
              <span>{t(key)}</span>
              {id === "payments" &&
                workspace.overview.awaitingAuthorizationCount > 0 && (
                  <span className="nav-count">
                    {workspace.overview.awaitingAuthorizationCount}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-indicator">
            <span className="sandbox-indicator-dot" />
            <span>
              <strong>{t("app.processorSimulator")}</strong>
              <small>{t("app.noExternalFunds")}</small>
            </span>
          </div>
          <div className="account-control">
            <span className="account-avatar" aria-hidden="true">
              {userDisplayName.slice(0, 1)}
            </span>
            <span className="account-name">
              <small>{t("app.releaseVersion", { version: APP_VERSION })}</small>
              <strong>{userDisplayName}</strong>
              <small>{t(`role.${user.role}`)}</small>
            </span>
            <button
              aria-label={t("app.signOut")}
              className="icon-button sidebar-logout"
              onClick={() => void handleLogout()}
              type="button"
            >
              <LogOut aria-hidden="true" size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{t("navigation.breadcrumb")}</span>
            <span aria-hidden="true">/</span>
            <strong>{currentPageTitle}</strong>
          </div>
          <div className="topbar-right">
            <div className="environment-pill">
              <span /> {t("app.environment")}
            </div>
            <button
              aria-label={t("app.refresh")}
              className="icon-button refresh-button"
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              title={t("app.refreshTitle")}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={isRefreshing ? "spin" : ""}
                size={17}
              />
            </button>
            <span className="topbar-divider" />
            <span className="topbar-role">
              <ShieldCheck aria-hidden="true" size={16} />{" "}
              {t(`role.${user.role}`)}
            </span>
          </div>
        </header>

        <div className="workspace-content">
          {offline ? (
            <OfflineNotice onRetry={() => void handleRefresh()} />
          ) : null}
          {pageError && (
            <div className="page-alert" role="alert">
              <TriangleAlert aria-hidden="true" size={17} />
              <span>{pageError}</span>
              <button
                aria-label={t("app.dismissError")}
                className="alert-dismiss"
                onClick={() => setPageError("")}
                type="button"
              >
                {t("app.dismissError")}
              </button>
            </div>
          )}
          <div className="sandbox-banner">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>
              <strong>{t("app.localProcessing")}</strong> ·{" "}
              {t("app.sandboxNotice")}
            </span>
            <span className="sandbox-banner-tag">{t("app.sandboxTag")}</span>
          </div>

          {page === "overview" && (
            <OverviewPage
              canCreateIntent={Boolean(canCreateIntent)}
              data={workspace}
              onCreateIntent={() => setShowNewPayment(true)}
              onOpenPayment={setSelectedPayment}
              onShowAll={() => setPage("payments")}
            />
          )}
          {page === "payments" && (
            <PaymentsPage
              canCreateIntent={Boolean(canCreateIntent)}
              payments={workspace.payments}
              search={search}
              statusFilter={statusFilter}
              onCreateIntent={() => setShowNewPayment(true)}
              onOpenPayment={setSelectedPayment}
              onSearchChange={setSearch}
              onStatusChange={setStatusFilter}
            />
          )}
          {page === "webhooks" && (
            <OperationsPage
              descriptionKey="page.webhooks.description"
              eyebrowKey="page.webhooks.eyebrow"
              icon={Webhook}
              titleKey="page.webhooks.title"
            >
              <WebhookEventsTable events={workspace.webhooks} />
            </OperationsPage>
          )}
          {page === "reconciliation" && (
            <OperationsPage
              descriptionKey="page.reconciliation.description"
              eyebrowKey="page.reconciliation.eyebrow"
              icon={FileCheck2}
              titleKey="page.reconciliation.title"
            >
              <ReconciliationTable rows={workspace.reconciliations} />
            </OperationsPage>
          )}
          {page === "audit" && (
            <OperationsPage
              descriptionKey="page.audit.description"
              eyebrowKey="page.audit.eyebrow"
              icon={ClipboardList}
              titleKey="page.audit.title"
            >
              <AuditEventsTable events={workspace.auditEvents} />
            </OperationsPage>
          )}
        </div>
      </main>

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.kind === "success" ? (
            <CheckCircle2 aria-hidden="true" size={18} />
          ) : (
            <TriangleAlert aria-hidden="true" size={18} />
          )}
          <span>{toast.message}</span>
          <button
            aria-label={t("app.dismissNotification")}
            onClick={() => setToast(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}

      {showNewPayment && (
        <NewPaymentDialog
          busy={isCreatingIntent}
          error={creationError}
          onClose={() => {
            setShowNewPayment(false);
            setCreationError("");
          }}
          onCreate={handleCreateIntent}
        />
      )}
      {selectedPayment && (
        <PaymentDetailsDrawer
          busyAction={busyAction}
          error={drawerError}
          events={workspace.webhooks}
          intent={selectedPayment}
          onAction={handlePaymentAction}
          onClose={() => {
            setSelectedPayment(null);
            setDrawerError("");
          }}
          onRefund={handleRefund}
          reconciliations={workspace.reconciliations}
          user={user}
        />
      )}
    </div>
  );
}

function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useContent();
  return (
    <div className="connection-notice" role="status">
      <WifiOff aria-hidden="true" size={17} />
      <span>{t("app.offlineNotice")}</span>
      <button
        className="secondary-button"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={15} /> {t("app.tryAgain")}
      </button>
    </div>
  );
}

function OverviewPage({
  canCreateIntent,
  data,
  onCreateIntent,
  onOpenPayment,
  onShowAll,
}: {
  canCreateIntent: boolean;
  data: WorkspaceData;
  onCreateIntent: () => void;
  onOpenPayment: (payment: PaymentIntent) => void;
  onShowAll: () => void;
}) {
  const { model, t } = useContent();
  const { overview, payments } = data;
  const currency = dataString(model, "currency.code");
  const numberFormat = new Intl.NumberFormat(model.locale);
  const metrics = [
    {
      label: t("metrics.capturedVolume"),
      value: formatMoney(overview.capturedAmountMinor, currency, model.locale),
      note: t("metrics.capturedIntents", {
        count: numberFormat.format(overview.capturedIntentCount),
      }),
      icon: CircleDollarSign,
      accent: "mint",
    },
    {
      label: t("metrics.paymentIntents"),
      value: numberFormat.format(overview.totalIntentCount),
      note: t("metrics.authorized", {
        count: numberFormat.format(overview.authorizedIntentCount),
      }),
      icon: CreditCard,
      accent: "blue",
    },
    {
      label: t("metrics.awaitingAuthorization"),
      value: numberFormat.format(overview.awaitingAuthorizationCount),
      note: t("metrics.declined", {
        count: numberFormat.format(overview.declinedCount),
      }),
      icon: Clock3,
      accent: "amber",
    },
    {
      label: t("metrics.reconciliationMismatches"),
      value: numberFormat.format(overview.reconciliationMismatchCount),
      note: t("metrics.pendingWebhooks", {
        count: numberFormat.format(overview.pendingWebhookCount),
      }),
      icon: TriangleAlert,
      accent: "coral",
    },
  ];
  const flow = [
    {
      key: "state.CREATED",
      value: overview.awaitingAuthorizationCount,
      color: "var(--signal-amber)",
    },
    {
      key: "state.AUTHORIZED",
      value: overview.authorizedIntentCount,
      color: "var(--signal-blue)",
    },
    {
      key: "state.CAPTURED",
      value: overview.capturedIntentCount,
      color: "var(--signal-mint)",
    },
    {
      key: "state.DECLINED",
      value: overview.declinedCount,
      color: "var(--signal-coral)",
    },
  ];

  return (
    <>
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">{t("page.overview.eyebrow")}</div>
          <h1>{t("page.overview.title")}</h1>
          <p>{t("page.overview.description")}</p>
        </div>
        {canCreateIntent && (
          <button
            className="primary-button heading-action"
            onClick={onCreateIntent}
            type="button"
          >
            <CreditCard aria-hidden="true" size={17} />{" "}
            {t("payments.newIntent")}
          </button>
        )}
      </div>

      <section aria-label={t("overview.metricsLabel")} className="metric-grid">
        {metrics.map(({ label, value, note, icon: Icon, accent }) => (
          <article className="metric-panel" key={label}>
            <div className={`metric-icon metric-icon-${accent}`}>
              <Icon aria-hidden="true" size={18} />
            </div>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{value}</strong>
            <span className="metric-note">{note}</span>
          </article>
        ))}
      </section>

      <div className="overview-grid">
        <section
          aria-labelledby="lifecycle-title"
          className="surface-panel lifecycle-panel"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("overview.stateDistribution")}</span>
              <h2 id="lifecycle-title">{t("overview.lifecycle")}</h2>
            </div>
            <span className="panel-icon">
              <Activity aria-hidden="true" size={17} />
            </span>
          </div>
          <div
            aria-label={t("overview.intentsByState")}
            className="lifecycle-track"
          >
            {flow.map((item) => (
              <span
                key={item.key}
                style={{ backgroundColor: item.color, flexGrow: item.value }}
                title={`${t(item.key)}: ${numberFormat.format(item.value)}`}
              />
            ))}
            {overview.totalIntentCount === 0 && (
              <span className="lifecycle-empty" />
            )}
          </div>
          <div className="lifecycle-legend">
            {flow.map((item) => (
              <div className="lifecycle-key" key={item.key}>
                <span style={{ backgroundColor: item.color }} />
                <span>{t(item.key)}</span>
                <strong>{numberFormat.format(item.value)}</strong>
              </div>
            ))}
          </div>
          <div className="lifecycle-footnote">
            <span>
              <ShieldCheck aria-hidden="true" size={15} />{" "}
              {t("overview.countsScoped")}
            </span>
            <span>
              {t("overview.total", {
                count: numberFormat.format(overview.totalIntentCount),
              })}
            </span>
          </div>
        </section>

        <section
          aria-labelledby="ops-status-title"
          className="surface-panel ops-status-panel"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("overview.operationsSignals")}</span>
              <h2 id="ops-status-title">{t("overview.needsAttention")}</h2>
            </div>
            <span className="panel-icon">
              <BellRing aria-hidden="true" size={17} />
            </span>
          </div>
          <div className="attention-row">
            <span className="attention-icon attention-webhook">
              <Webhook aria-hidden="true" size={17} />
            </span>
            <span>
              <strong>{t("overview.pendingWebhooks")}</strong>
              <small>{t("overview.webhooksWaiting")}</small>
            </span>
            <b>{overview.pendingWebhookCount}</b>
          </div>
          <div className="attention-row">
            <span className="attention-icon attention-recon">
              <TriangleAlert aria-hidden="true" size={17} />
            </span>
            <span>
              <strong>{t("overview.reconciliationMismatches")}</strong>
              <small>{t("overview.operatorReview")}</small>
            </span>
            <b>{overview.reconciliationMismatchCount}</b>
          </div>
          <div className="attention-row">
            <span className="attention-icon attention-decline">
              <Banknote aria-hidden="true" size={17} />
            </span>
            <span>
              <strong>{t("overview.declinedSimulations")}</strong>
              <small>{t("overview.expectedOutcomes")}</small>
            </span>
            <b>{overview.declinedCount}</b>
          </div>
          <p className="panel-safety-note">{t("overview.declineNote")}</p>
        </section>
      </div>

      <section
        aria-labelledby="recent-payments-title"
        className="surface-panel recent-panel"
      >
        <div className="panel-heading recent-heading">
          <div>
            <span className="eyebrow">{t("overview.latestActivity")}</span>
            <h2 id="recent-payments-title">{t("overview.recentPayments")}</h2>
          </div>
          <button className="text-button" onClick={onShowAll} type="button">
            {t("overview.viewAll")}{" "}
            <ArrowUpRight aria-hidden="true" size={16} />
          </button>
        </div>
        <PaymentTable
          payments={payments.slice(0, 5)}
          onSelect={onOpenPayment}
        />
      </section>
    </>
  );
}

function PaymentsPage({
  canCreateIntent,
  payments,
  search,
  statusFilter,
  onCreateIntent,
  onOpenPayment,
  onSearchChange,
  onStatusChange,
}: {
  canCreateIntent: boolean;
  payments: PaymentIntent[];
  search: string;
  statusFilter: PaymentStatus | "ALL";
  onCreateIntent: () => void;
  onOpenPayment: (payment: PaymentIntent) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: PaymentStatus | "ALL") => void;
}) {
  const { model, t } = useContent();
  const numberFormat = new Intl.NumberFormat(model.locale);
  return (
    <>
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">{t("page.payments.eyebrow")}</div>
          <h1>{t("page.payments.title")}</h1>
          <p>{t("page.payments.description")}</p>
        </div>
        {canCreateIntent && (
          <button
            className="primary-button heading-action"
            onClick={onCreateIntent}
            type="button"
          >
            <CreditCard aria-hidden="true" size={17} />{" "}
            {t("payments.newIntent")}
          </button>
        )}
      </div>
      <section
        aria-label={t("payments.filterLabel")}
        className="surface-panel filter-panel"
      >
        <label className="search-control">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">{t("payments.searchLabel")}</span>
          <input
            autoComplete="off"
            maxLength={80}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("payments.searchPlaceholder")}
            value={search}
          />
        </label>
        <label className="status-filter">
          <span>{t("payments.status")}</span>
          <select
            onChange={(event) =>
              onStatusChange(event.target.value as PaymentStatus | "ALL")
            }
            value={statusFilter}
          >
            <option value="ALL">{t("payments.allStatuses")}</option>
            <option value="CREATED">{t("status.CREATED")}</option>
            <option value="AUTHORIZED">{t("status.AUTHORIZED")}</option>
            <option value="CAPTURED">{t("status.CAPTURED")}</option>
            <option value="PARTIALLY_REFUNDED">
              {t("status.PARTIALLY_REFUNDED")}
            </option>
            <option value="REFUNDED">{t("status.REFUNDED")}</option>
            <option value="VOIDED">{t("status.VOIDED")}</option>
            <option value="DECLINED">{t("status.DECLINED")}</option>
          </select>
        </label>
        <span className="filter-result-count">
          {t("payments.shown", { count: numberFormat.format(payments.length) })}
        </span>
      </section>
      <section
        aria-label={t("payments.tableLabel")}
        className="surface-panel table-panel"
      >
        <PaymentTable payments={payments} onSelect={onOpenPayment} />
      </section>
    </>
  );
}

function OperationsPage({
  eyebrowKey,
  titleKey,
  descriptionKey,
  icon: Icon,
  children,
}: {
  eyebrowKey: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const { t } = useContent();
  const title = t(titleKey);
  return (
    <>
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">{t(eyebrowKey)}</div>
          <h1>{title}</h1>
          <p>{t(descriptionKey)}</p>
        </div>
        <span className="heading-illustration">
          <Icon aria-hidden="true" size={22} />
        </span>
      </div>
      <section
        aria-label={title}
        className="surface-panel table-panel operations-table-panel"
      >
        {children}
      </section>
    </>
  );
}

export default App;
