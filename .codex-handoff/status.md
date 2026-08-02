# Status: close Spark configuration and verification gaps

## 1. Summary and changed files

Three categories of changes:

**Remove fallback configuration duplication:**
- `src/lib/spark/sparkSettingsToRendererOptions.ts` (new) — Pure helper converting `SparkSettings` → `SparkRendererOptions`. Maps `lodSplatCount: null` to `undefined`. No baseline literals.
- `src/lib/components/SparkStudioBridge.svelte` — Removed all hardcoded fallback values (`lodSplatScale: 1`, `maxStdDev: 2.8`, etc.). `sparkControls` is now required. Renderer options come exclusively from `sparkSettingsToRendererOptions(sparkControls.settings)`.
- `src/lib/components/SceneRuntime.svelte` — `sparkControls` prop is now required (not optional). Removed null checks around sparkControls usage.

**Identity-safe source-sync permission:**
- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts` — Added `canSourceSync(controls)` method for identity-aware source sync checks. Same-controller re-attach with changed metadata now notifies subscribers.
- `src/lib/studio/scroll-animator/transactionGuard.ts` — Uses `canSourceSync(tx.object)` instead of global `sourceSyncEnabled` boolean. Stale/detached controllers never inherit a newer controller's permission.

**Complete the missing tests:**
- `tests/unit/activeSparkControlsRuntime.test.ts` — Added 14 tests: sourceSyncEnabled default/explicit, canSourceSync identity checks, same-controller reattach notification, stale detach safety, destroy clearing.
- `tests/unit/sparkSettingsToRendererOptions.test.ts` (new) — 7 tests: all 22 fields mapped, null→undefined, scene overrides in snapshot, inactive profile isolation, no infrastructure options.
- `tests/unit/transactionGuard.test.ts` — Updated to use shared `controls` instance from `beforeEach`. Added stale/non-active controller test.
- `tests/unit/profileTransactionGuard.test.ts` — Updated to use shared `controls`. Added stale controller test with new persistable active.
- `tests/unit/profileSettingsTransaction.test.ts` — Updated guard tests to use shared `controls`.
- `tests/e2e/rad-story.spec.ts` — Added "Start writes splat_url and preserves unrelated query parameters" test.

**Documentation:**
- `AGENTS.md` — Updated: required-controller initialization from `sparkSettingsToRendererOptions()`, identity-aware `canSourceSync()`, same-controller re-attach notification, new test references.
- `README.md` — Names `splat_url` query parameter.

## 2. Exact renderer initialization flow

1. Scene file calls `createSceneObjects(profileName, profileSettings)` → creates `SparkControls` with `getGlobalBaseline(profileName)` + validated scene overrides.
2. `SceneRuntime` receives required `sparkControls` prop.
3. `SparkStudioBridge.onMount()` reads `sparkControls.settings` (complete 22-field validated snapshot).
4. `sparkSettingsToRendererOptions(settings)` converts to `SparkRendererOptions` (maps `null` → `undefined` for `lodSplatCount`).
5. Infrastructure options (`renderer`, `onDirty`, `pagedExtSplats`) are spread on top by the bridge.
6. Both renderers are constructed with these complete options — no fallback literals exist anywhere.
7. After `attach()`, the `onChange` subscription handles subsequent edits via `applySettings(old, new)`.

## 3. Exact identity-aware source-sync decision flow

**Transaction guard (`guardScrollAnimatorTransactions`):**
1. For each SparkControls transaction, calls `activeSparkControlsRuntime.canSourceSync(tx.object)`.
2. `canSourceSync(controls)` returns `true` only when:
   - `controls === this._active` (exact identity match)
   - `this._sourceSyncEnabled === true` (current registration permits sync)
3. If `canSourceSync` returns `false`, `tx.sync` is cleared (blocked).
4. If `true`, only exact-root `profileSettings` attribute passes through. All nested paths and other attributes remain blocked.

**Pane (`SparkControlsExtension`):**
1. Tracks `uiState.sourceSyncEnabled` from `activeSparkControlsRuntime.sourceSyncEnabled`.
2. Skips building/committing source-sync transactions when `!uiState.sourceSyncEnabled`.
3. Shows "Session-only" warning for ad-hoc viewer.

**Registration:**
- File-backed edit mode: `attach(controls, profileName, { sourceSyncEnabled: true })`
- Ad-hoc viewer: `attach(controls, profileName, { sourceSyncEnabled: false })` (explicit in `RadStoryScene`)
- Same-controller re-attach with changed `sourceSyncEnabled` notifies subscribers (metadata-only change detection).

## 4. Tests added, with full command results

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | Clean (0 errors, 0 warnings) |
| `npm run test:unit` | 26 files, 426 tests passed |
| `npm run test:e2e` | 138 tests passed |
| `npm run build` | Built successfully |
| `git diff --check` | Clean |

**New test counts:**
- `activeSparkControlsRuntime.test.ts`: +14 tests (source sync capability, canSourceSync, same-controller reattach, stale detach)
- `sparkSettingsToRendererOptions.test.ts`: +7 tests (new file — field mapping, null conversion, scene overrides, inactive isolation)
- `transactionGuard.test.ts`: +1 test (stale/non-active controller blocked)
- `profileTransactionGuard.test.ts`: +1 test (stale controller with new persistable active)
- `rad-story.spec.ts`: +1 e2e test (Start writes splat_url, preserves debug, removes legacy url)

## 5. Acceptance checklist

- [x] No Spark setting fallback literals remain in `SparkStudioBridge` or new conversion helper; global values come only from the two baselines.
- [x] Both renderers start from the complete effective settings snapshot, including active scene overrides and null-to-undefined conversion.
- [x] Spark source-sync permission is evaluated for the exact transaction controller identity via `canSourceSync(controls)`.
- [x] Same-controller metadata re-registration notifies subscribers (tested). Stale detach is safe and tested.
- [x] Dynamic/session-only edits remain live; file-backed exact-root `profileSettings` persistence remains enabled.
- [x] Tests explicitly cover runtime capability (14 new), initial renderer snapshot (7 new), stale transaction identity (2 new), `splat_url` with unrelated query preservation (1 new e2e).
- [x] README names `splat_url`; AGENTS.md accurately describes identity-aware source-sync and required-controller initialization.
- [x] `npm run check`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, and `npm run build` pass.

## 6. Optional real `buildTransaction` import

Not used. The existing `studioBuildTransaction.test.ts` from the previous mission uses `resolvePropertyPath` from `@threlte/core` and replicates the exact Studio write callback semantics. The internal `buildTransaction` import path (`@threlte/studio/dist/...`) is not exposed in package exports and would require a test-only relative path coupled to the pinned Studio 0.4.3 internal layout. The accepted replica is sufficient and stable.

## 7. Residual risks

- The `sparkSettingsToRendererOptions` helper is a small centralized mapping. If Spark adds new constructor options in a future version, the helper must be updated. The `SparkSettings` interface and `SETTINGS_KEYS` constant serve as the authoritative field list.
- The `canSourceSync` identity check depends on object identity. If a scene somehow creates and registers a new `SparkControls` instance mid-session (not the current design), the old instance's pending transactions would be blocked. This is the intended safety behavior.

## 8. Final commit hash

`caed4f7` on `main` at `github.com:Avnerus/rad-story`
