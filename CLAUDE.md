# CLAUDE.md

## Overview

Financial-scenario comparison tool: users compare up to 3 scenarios (e.g. "rent & invest", "buy a home", "landlord/rental") side by side on a net-worth chart over a chosen time horizon (1–50 years). React 18 + TypeScript + Zustand + Vite, styled with Tailwind, charts via Recharts. Fully static client-side app — no backend, deployed to GitHub Pages. Market data (CPI, FX) is a **build-time snapshot** (`src/data/snapshot.json`), never fetched at runtime.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc && vite build` (runs `prebuild` → `fetch-market-data.mjs` first)
- `npm run fetch-data` — refresh `src/data/snapshot.json` via `scripts/fetch-market-data.mjs`
- `npm test` — Vitest run (one-shot)
- `npm run test:watch` — Vitest watch
- `npm run lint` — ESLint over `.ts,.tsx`
- Single test file: `npx vitest run src/engine/__tests__/simulate.test.ts`
- Type check (must be clean before done): `npx tsc --noEmit`
- GH Pages base path defaults to `/evaluator/`; override with `VITE_BASE=/ npm run build`.

## Architecture

Three layers, strict dependency direction `engine` ← `state` ← `ui`.

**`src/engine/`** — pure, framework-free calculation (no React, no DOM):
- `types.ts` — all domain types (`Block` union, `Scenario`, `MonthlyPoint`, `SimulationSummary`, `MarketData`).
- `simulate.ts` — the monthly loop. Order per month: (1) compute salary net (informational only); (2) step **cost** blocks (mortgage, rent, rental); (3) sum cash contribution = `cashBlock.monthlyContribution + rent differential + rental net cash flow`; (4) step the **asset** (cash) block with that total; (5) snapshot. Down payment debits the sibling cash block **once at month 0** (before the month-0 snapshot). Capital-gains tax computed at horizon only. Landlord §9 tax settled annually (month 11/23/35…) from YTD accumulators.
- `blocks/` — one file per kind (`cash`, `mortgage`, `rent`, `rental`) with `init*State` + `step*Block`; `registry.ts` maps each kind to a `'cost' | 'asset'` phase and sorts blocks so cost runs before asset.
- `math/` — pure formulas (`compound`, `growth`, `inflation`, `mortgage`, `rentalTax`).
- `aggregate.ts` — builds Recharts series (net-worth, breakdown, cash-flow) and applies the real/nominal transform (`nominal / point.cpiIndex`).

**`src/state/`** — Zustand store + persistence:
- `store.ts` — `useEvaluatorStore`, single source of truth. Holds `appState` + `marketData`. Simulations are memoized (stable-stringify key, LRU cap 32) and **never persisted**. `DEFAULT_STATE` and `DEFAULT_RENTAL_BLOCK` live here.
- `schema.ts` — Zod schemas mirroring `types.ts`, plus the **versioned migration system** (`CURRENT_VERSION`, currently **2**; `migrations[n]` transforms version n → n+1; the harness owns the `schemaVersion` bump). A compile-time `Equal<AppState, ValidatedAppState>` assertion fails the build if the hand-written types and Zod schema drift.
- `url.ts` — lz-string hash codec with **short stable keys** (explicit, not generic JSON). Hash format `#v=<ver>&s=<compressed>`.
- `persistence.ts` — localStorage (`evaluator:state`, debounced 300ms), inputs only.
- `saves.ts` — named-saves CRUD (`evaluator:saves` namespace, entirely independent of `evaluator:state`). Reuses the `encodeAppState`/`decodeHash` codec from `url.ts`. `resetToDefaults` does NOT clear this namespace — named saves survive a reset. Store actions (`saveCurrentAs`, `overwriteSave`, `loadSave`, `renameSave`, `deleteSave`) live in `store.ts` and delegate here.
- `selectors.ts` — memoized hooks; UI reads these, not the store directly.
- **Load priority: URL hash > localStorage > `DEFAULT_STATE`.** Store subscribes to write hash + localStorage on every change.

**`src/ui/`** — `components/` (forms, pickers, buttons), `charts/` (Recharts wrappers), `hooks/`. `src/data/` is the market-data layer (snapshot → cache → defaults; never throws).

## The Block model (core convention)

`Scenario = { id, name, salary, blocks[] }`. `Block` is a **discriminated union keyed by `kind`**: `cash | mortgage | rent | rental`. The engine supports **at most one block of each kind per scenario** (`simulate.ts` takes `[0]`). `assertNever` enforces exhaustiveness at compile time across every switch on `kind`.

### Checklist: adding a new block kind

Every site below must be updated; the compiler (via `assertNever` + the Zod `Equal` assertion) flags most omissions:

1. `engine/types.ts` — add the block interface, widen the `Block` union, add any new `MonthlyPoint`/`SimulationSummary` fields.
2. `engine/blocks/<kind>.ts` — `init<Kind>State` + `step<Kind>Block`.
3. `engine/blocks/registry.ts` — add `case` in `blockPhase` returning `'cost'` or `'asset'`.
4. `engine/simulate.ts` — wire init, step, contribution routing, and the `snapshotMonth` fields.
5. `engine/aggregate.ts` — emit any new chart series.
6. `state/schema.ts` — add the Zod arm to `BlockSchema`, **bump `CURRENT_VERSION`**, add the migration entry.
7. `state/url.ts` — add encode/decode with a **unique short `k` key** that does not collide (note `rent` = consumption rent, `rnt` = rental property, `mtg` = mortgage).
8. `state/store.ts` — update `DEFAULT_STATE` and/or the inline `addScenario` block; add a `DEFAULT_*_BLOCK` const if useful.
9. `ui/components/<Kind>BlockForm.tsx` — the form.
10. `ui/components/BlockEditor.tsx` — add `case` in both `BlockForm` and `BlockKindLabel`.
11. `ui/components/AddBlockButton.tsx` — add `case` in `makeDefaultBlock` (**this is where the per-kind default factory lives**) and a menu entry.
12. Update summary/cash-flow charts if the kind adds new flows.

## Conventions & invariants

- **Engine is nominal-only.** Real/nominal conversion happens in the UI/`aggregate.ts` via `cpiIndex`. The engine never converts.
- **Salary is informational.** `salaryNet` is recorded for display but **never routed** into any block. Routing it is an intentional feature, not a bug-fix.
- **Down payment debits the sibling cash block exactly once at month 0**, with **no clamping** (negative cash is a meaningful "under-funded" signal). It must **not** reduce `totalContributions` (doing so would inflate capital-gains tax, since `gains = balance − totalContributions`).
- **Negative cash contributions are allowed** (e.g. a negative-cash-flow rental routes a negative amount into cash — not clamped).
- **`assertNever` exhaustiveness** on every `kind` switch.
- **URL short-keys must stay unique** and never silently change when domain types are refactored.
- Property value / mortgage balance in `snapshotMonth` are **summed across all property blocks** (mortgage + rental), not `??`-fallen-back.

## Testing

- Vitest + jsdom (`environment: 'jsdom'`, setup `src/test-setup.ts`), include `src/**/*.test.{ts,tsx}`.
- Tests live in per-area `__tests__/` folders (e.g. `src/engine/__tests__/`, `src/state/__tests__/`).
- Style: reference-value checks (assert exact computed numbers) plus invariant checks (e.g. down-payment debited once, cgtax on gains only, URL round-trips).
- **A change is not done until `npm test` passes and `npx tsc --noEmit` is clean.**

## Agent workflow

For non-trivial features: **software-architect** designs → **backend-dev** implements `engine/` + `state/` (land shared types first) → **frontend-dev** implements UI (`src/ui` only) → **code-reviewer** reviews → fix findings with the implementing agent. Verify with `npm test`, `npx tsc --noEmit`, and `npm run build`.
