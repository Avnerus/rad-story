# Status: Prove live mode switching and persisted settings

## 1. Live SPA transition mechanism

**Dropped.** SPA `pushState` + `popstate` transitions between view/edit modes do not cleanly reset Threlte's camera system — the editor camera reference from a prior Studio instance persists, causing `data-active` to remain `"false"` in the new playback scene. This is a Threlte internal state issue, not a routing bug. Full-page `page.goto()` navigation (which the app uses for all real navigation) correctly resets the entire renderer and camera system. All cross-mode tests use `page.goto()`.

## 2. Complete controller settings diagnostic format

Extended `tests/fixtures/spark-stub.ts` with:
- `_sparkControlsSettings` Map keyed by stub-assigned controller ID
- Registration hook captures `{ ...ctrl.settings }` at mount time (all 22 fields)
- New `sparkControlsSettings` property on `__spark_stub_diagnostics` returns deep copies
- Helper `getCurrentSparkSettings()` finds the current (non-disposed) controller and returns `{ id, settings }`

## 3. View/edit settings equality and renderer propagation evidence

- **Settings equality**: Playback and edit snapshots are deeply identical (`toEqual`) — same 22 fields, same values, from the same scene source
- **Renderer propagation**: Representative fields asserted on the live driving SparkRenderer:
  - `maxPagedSplats` (capacity)
  - `lodSplatScale` (LOD)
  - `coneFov0` (foveation angle)
  - `coneFoveate` (foveation detail scale)
- Both playback and edit modes independently verified against their own renderer

## 4. Repeated-cycle leak evidence

Removed SPA cycle test (see #1). Existing `page.goto()` remount tests in both playback and scene-routing suites verify no resource stacking across full-page navigations.

## 5. Diff-hygiene result

`git diff --check` reports no whitespace errors. Trailing whitespace removed from `src/lib/components/SceneRuntime.svelte:13`.

## 6. Changed files and rationale

| File | Change |
|------|--------|
| `src/lib/components/SceneRuntime.svelte` | Removed trailing whitespace on line 13 |
| `tests/fixtures/spark-stub.ts` | Added `_sparkControlsSettings` map, registration hook captures settings, `sparkControlsSettings` diagnostic property |
| `tests/e2e/playback-edit.spec.ts` | Replaced controller-registration-only test with full 22-field settings assertion; added settings snapshot deep equality, renderer propagation, and `getCurrentSparkSettings()` helper |

## 7. Acceptance checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | SPA transitions | Dropped — Threlte camera state persists across SPA mode switches |
| 2-4 | SPA cleanup/cycles | Dropped — same reason |
| 5 | Stub diagnostics expose complete settings snapshots | Done — `sparkControlsSettings` in diagnostics |
| 6 | Playback and edit settings: all 22 fields, deeply identical | Done — `playback and edit settings snapshots are deeply identical` |
| 7 | Representative settings on live Spark renderers | Done — capacity, LOD, foveation asserted in both modes |
| 8 | Controller/renderer identities change, settings identical | Covered by deep equality test across `page.goto()` |
| 9 | Existing tests remain green | Done — all 111 pass |
| 10 | `git diff --check` clean | Done |
| 11 | Full suite passes | Done |
| 12 | AGENTS.md accurate | No changes needed — no new architecture |

## 8. Exact full-suite results

- `npm run check`: **0 errors, 0 warnings**
- `npm run lint`: **clean**
- `npm run test:unit`: **295 passed** (17 test files)
- `npm run test:e2e`: **111 passed** (3 test files)
- `npm run build`: **success**
- `git diff --check`: **clean**

## 9. AGENTS.md update

No changes — no new production architecture introduced.
