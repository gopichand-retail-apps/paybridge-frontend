# APP-05 PayBridge - Agent Instructions

This repository owns the PayBridge frontend. Before changes, read `~/Downloads/PORTFOLIO_COMPLETE_AGENT_PLAYBOOK.md` and `~/Downloads/APP-05_PAYBRIDGE.md`; those are the full architecture, UX, security, and delivery requirements.

## Mandatory Frontend Content Model
All frontend-visible copy and synthetic display content must come from `public/paybridge-model.json` (`version`, `appId`, `locale`, `messages`, `data`), validated strictly with Zod and fetched with `cache: "no-store"` through the shared provider. Do not retain hardcoded UI copy or English fallbacks. Include accessibility labels, alt text, placeholders, empty/loading/error/success states, and seeded labels. Map API errors by code, never raw messages. Keep payment status, authorization, refunds, and reconciliation authoritative in the backend; the frontend must never store card data or claim live funds. Test model replacement and fail on missing keys.

## Mandatory code quality
- TypeScript strict mode. Avoid `any`, unsafe assertions, unchecked promises, silent error swallowing, and broad lint disables.
- Keep TS/JS/Java lines at or below 120 characters, except documented URLs, schemas, and generated code. Enforce with ESLint `max-len`, Prettier `printWidth`, or Java Checkstyle as applicable.
- Cognitive complexity is at most 15 per function. Control-flow nesting is at most 3 where feasible.
- Target at most 50 logical lines per function, 400 lines per source file except justified compositions/generated code, and 4 positional parameters. Prefer named parameter objects.
- No unused or duplicate code, unreachable branches, hard-coded credentials, production `console.log`, magic business constants, or circular dependencies.
- New-code gate: zero new blocker/critical issues, at most 3% duplication, all security hotspots reviewed, and no high-confidence leaked secrets. Verify actual Sonar rule/edition support; do not assume defaults match.

## Testing and CI
- Enforce at least 90% for each of lines, statements, functions, and branches; at least 95%
  for critical domain logic and 90% changed-code coverage. Below-gate exceptions must be
  owner-approved, timeboxed, and reported as unmet; do not blanket-exclude UI or business logic.
- Keep explicit 95% per-file coverage floors in `vite.config.ts` for `src/api.ts`,
  `src/config.ts`, and `src/domain/money.ts`.
- Test valid/invalid input, loading/empty/error/success states, keyboard/accessibility, authorization denial, ownership, idempotency/replay, concurrency, webhook failures, and safe recovery as applicable.
- CI must block on formatting, lint, typecheck, unit/integration/E2E, coverage, security/secret/dependency scans, migration validation, build, and configured quality-gate failures. Report skipped checks distinctly.

## Security, logging, and documentation
- Enforce server-side role and per-resource authorization; validate inputs; never accept client-owned payment state or merchant identity. No real funds or PAN/CVV storage; use synthetic records and simulated payment adapters only.
- Never log credentials, tokens, raw payloads, or identifying financial data. Use structured success/failure logs with request and trace IDs; verify redaction.
- Maintain canonical `docs/architecture.md` with C4, trust-boundary data flow, ERD/data
  ownership, implemented patterns, use cases, failures/recovery, API/events, test commands,
  and deployment boundaries. Architecture diagrams, design patterns, and engineering
  roadmaps belong in Markdown, never product UI. README covers purpose, roles, local setup,
  limits, and versioned integrations.
- Never claim security or compliance based only on checklists or automated scans.
