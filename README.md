# PayBridge Frontend

[Architecture guide](docs/architecture.md) — source map, workflows, contracts, data, security, and checks.

## Repository layout and Windows workflow

This is the PayBridge React/Vite frontend repository. It keeps its own Git history, origin, package manifest, and lockfile; the API is the independent [paybridge-backend](https://github.com/gopichand-retail-apps/paybridge-backend) repository. Place the pair under one PayBridge folder to use the supplied single-folder VS Code workspace.

Use Node **24.15.0** and npm with the committed lockfile. From this repository in PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

The client is at http://127.0.0.1:5601; start the API separately. For both services in the complete Retail Apps workspace, use `./scripts/Start-Apps.ps1 -App PayBridge` from the workspace root. Use `-EnvironmentName IT` only for the independent IT copies.

See the [app overview](docs/architecture.md#1-scope-users-and-repository-boundary) and [canonical architecture](docs/architecture.md). The architecture guide is included in this repository. No cross-app backend integration is added by this organization change.

React 19 and TypeScript payment operations workspace. The frontend and Spring Boot API are separate Git repositories.

## Run locally

Prerequisites: Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Vite serves `http://127.0.0.1:5601` and proxies `/api` and `/actuator` to the API at `http://127.0.0.1:5602`. Start the backend before signing in. Mock mode uses this same-origin proxy by default.

## Build-time API mode

`VITE_IS_MOCK` is a build-time setting that defaults to `true`. It selects the PayBridge API origin;
it is not a browser-storage override, role selector, or payment-state switch. Changing modes
requires restarting the development server or rebuilding the frontend.

In local development, requests use the same-origin Vite proxy to `127.0.0.1:5602` unless an
explicit API origin is configured. A deployed mock build must set `VITE_MOCK_API_BASE_URL`; a
server-mode build uses `VITE_REAL_API_BASE_URL` (or the legacy `VITE_API_BASE_URL`). Explicit
origins must use HTTPS except on loopback. Cross-origin API calls include session credentials, so
the API must allow the exact frontend origin with credentialed CORS. These origins identify
PayBridge APIs, not payment processors or identity providers.

Both modes fetch workspace profiles from `GET /api/v1/auth/profiles` and authenticate by submitting
only the selected account ID to `POST /api/v1/auth/profile-login`. The server validates the
account, assigns the role, and creates the session. `public/paybridge-model.json` supplies
presentation labels for the server-owned profiles; it is not an alternate role catalog and
contains no credentials. Both modes use the PayBridge API for sessions, payment intents,
authorization, capture, refunds, webhooks, reconciliation, and audit history. Payment state,
authorization, ownership, and idempotency remain server-owned; the processor simulator is
sandbox-only and no real funds move.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm audit
npm run build
PAYBRIDGE_E2E_MODE=true npm run test:e2e
PAYBRIDGE_E2E_MODE=false npm run test:e2e
```

`npm run test:coverage` instruments production TypeScript and TSX files, reports text, HTML, and
LCOV coverage in `coverage/`, and enforces 90% overall statements, branches, functions, and lines.
The API client, API-mode configuration, and money module also have per-file 95% floors in all four
categories. Test files and `src/test/` helpers are excluded because they are not production code.

The latest local coverage run passed 72 tests across 15 files with **95.72% statements, 92.13%
branches, 91.71% functions, and 96.88% lines**. The aggregate and critical-file gates pass; no
production module is excluded from coverage.

The isolated E2E harness passed **1/1 in mock mode and 1/1 in live-selection mode**. It uses
synthetic seed data in an in-memory H2 database and verifies the selected API origin; it does not
connect to a production database. The current frontend GitHub Actions workflow does not run this
cross-repository E2E test.

## Workflows

- Merchant workspace profile sign-in and merchant-scoped payment intent listing.
- Payment intent creation, authorization, capture, webhook delivery, and reconciliation.
- Operator void/refund/reconciliation actions and auditor read-only access.
- Payment history, webhook events, reconciliation results, and audit history.

Payment amounts use integer minor units and all state transitions are enforced by the API. Local
profile sign-in is a synthetic workspace selector, not an identity provider. The processor adapter
is a simulator: no card numbers, CVV, bank credentials, live tokens, or real funds are used.

This portfolio application is not a production payment service and does not establish PCI DSS, privacy-law, tax, consumer-protection, accessibility, or other regulatory compliance. Obtain qualified security, legal, tax, and payment-provider review before collecting real data or deploying a live financial workflow.

## Application and integration flow

The React client renders the merchant, operator, and auditor workspaces. It sends same-origin requests through Vite to the Spring API, validates response shapes with Zod, and uses the server session plus CSRF token for state-changing requests. Payment state and authorization are owned by the API, not the browser.

CommerceHub or RetailFlow should integrate from its backend through a service adapter, not by sharing databases or placing service credentials in this browser bundle. The system-level architecture and user scenarios are maintained in the backend repository at `docs/architecture.md`.

## Vercel frontend configuration

Import this frontend's GitHub repository as its own Vercel project. Set **Root Directory** to the repository root (`./`), **Node.js Version** to **24.x**, and keep the checked-in [vercel.json](vercel.json). It selects Vite, dist output, and browser-route fallback with `npm ci` and `npm run build`. The SPA fallback excludes /api and /socket.io so missing backend routes do not return HTML.

Set `VITE_IS_MOCK=true` and `VITE_MOCK_API_BASE_URL` to an approved isolated HTTPS API **origin without /api/v1**. For the other selector, set `VITE_IS_MOCK=false` and `VITE_REAL_API_BASE_URL`. The [environment template](.env.vercel.example) lists exact names; it is documentation, not an automatically loaded production configuration. Replace its reserved .invalid host. Changing mode or endpoints requires a new build/deployment. Both selectors still call an API; neither creates a browser-only backend or real provider integration.

Production Vite assets do not contain the development proxy; requests use the configured absolute API URL. A hosted API needs independently verified identity, persistence, exact origin/CORS and session/CSRF settings. Existing APIs remain local-only; localhost in a deployed bundle would point at the visitor or build machine.

The configuration adds noindex, frame/content-type/referrer/permission protections and no-store for the active UI model. Headers and noindex do not provide access control. Keep preview deployment protection enabled and use synthetic data. Hosted routing, cookies, headers, and user workflows have **not** been verified; no deployment is performed.

Known release gaps: No processor is contacted and no funds move. The additional responsive check fails with horizontal overflow; formatting, durable webhook secrets, identity, and hosting still need work.
