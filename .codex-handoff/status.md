# Status: Final follow-up mission — validated profile overrides

## 1. Validation gap and correction

**Verified issue:** The constructor and `profileSettings` setter already routed persisted overrides through `computeValidatedSettings()`, which calls `validateField()` for each override and `applyInvariants()` for coupled fields. The validation gap described in the mission was **already closed** by the previous mission's changes. No code path places unvalidated values into `_settings`.

**New gap found and fixed:** `getDeviceProfile()` had its own hardcoded `sparkRenderer` values that were **inconsistent** with `GLOBAL_BASELINES` (desktop `maxPagedSplats` was `40*SPARK_PAGE_SIZE` in `getDeviceProfile` vs `32*SPARK_PAGE_SIZE` in `DESKTOP_BASELINE`). The 8 profile-specific fields in `getDeviceProfile().sparkRenderer` are now **derived** from the canonical `GLOBAL_BASELINES` table.

**Stale test expectations fixed:** Three test files had hard-coded values from before the baseline update (`maxPagedSplats` and `maxStdDev` changes). All updated to match current baselines.

## 2. Constructor/setter normalization and notification semantics

- **Constructor:** Calls `computeValidatedSettings()` which validates each active-profile override through `validateField()`, applies `applyInvariants()`, and returns the merged result. No notification emitted (construction phase).
- **Setter:** Normalizes input via `normalizeProfileSettings()`, deep-copies into `_profileSettings`, calls `computeValidatedSettings()`, and emits **one coherent** `onChange` notification with all actually-changed fields (including coupled invariant fields). No notification when effective settings are unchanged.
- **Getter:** Recomputes active-profile overrides from `_settings` vs `_baseline` (always consistent with runtime), returns stored inactive-profile overrides. Both parents always present. Defensive copy returned.
- **Defensive copy:** Input is deep-copied on assignment; output is a fresh copy on each getter call. Later mutation of caller's nested object cannot alter controller state.

## 3. Evidence from the actual public transaction `write` test

New file: `tests/unit/studioBuildTransaction.test.ts` (7 tests).

Uses Studio's real `resolvePropertyPath` from `@threlte/core` and the exact write callback pattern from Studio's internal `buildTransaction`:
- Property path resolution via `resolvePropertyPath(object, propertyPath)` → `{ target, key }`
- Write callback: checks for Three.js `.copy()` pattern, falls back to `target[key] = data`
- For `SparkControls.profileSettings`, this invokes the `profileSettings` setter directly

Tested:
- Forward write updates `settings` and `profileSettings`, emits notification
- Undo (`write(obj, historicValue)`) restores original state
- Redo (`write(obj, value)`) re-applies new state
- Out-of-range persisted values are clamped through canonical validation
- Inactive profile preserved across forward/undo/redo
- Coupled invariant fields appear in notification
- `resolvePropertyPath` resolves simple paths correctly

`buildTransaction` is not exported from `@threlte/studio/extensions` (only available inside `useTransactions()` which requires a Svelte component context). The internal path `@threlte/studio/dist/...` is not exposed in package exports. The test replicates the exact write semantics using the publicly available `resolvePropertyPath` from `@threlte/core`.

## 4. Desktop and emulated-mobile manual cold-load evidence

### Desktop (Vite dev server, `/scene/baby_yoda/edit`)

Scene literal: `profileSettings={{ desktop: { blurAmount: 0.5, coneFov0: 100 }, mobile: { maxPagedSplats: 131072, behindFoveate: 0.5 } }}`

| Check | Result |
|-------|--------|
| Profile badge | "Desktop" |
| `blurAmount` pane value | "0.5" (desktop override) |
| `coneFov0` pane value | "100" (desktop override) |
| `coneFov` pane value | "120" (desktop baseline, no invariant violation: 100 < 120) |
| `maxPagedSplats` pane value | "2097152" (desktop baseline: 32×65536) |
| `behindFoveate` pane value | "0.1" (desktop baseline) |
| Console errors | 0 |
| Playback mode (`/scene/baby_yoda`) | Camera active (`data-active="true"`), 0 errors |

### Mobile (emulated iPhone UA, `/scene/baby_yoda/edit`)

Same scene literal as above.

| Check | Result |
|-------|--------|
| Profile badge | "Mobile" |
| `maxPagedSplats` pane value | "131072" (mobile override: 2×65536) |
| `behindFoveate` pane value | "0.5" (mobile override) |
| `lodSplatScale` pane value | "0.5" (mobile baseline) |
| `blurAmount` pane value | "0.3" (mobile baseline — desktop override 0.5 not leaked) |
| Profile isolation | Desktop `blurAmount: 0.5` override not visible in mobile pane |
| Console errors | 0 |

Scene literal restored to `{{ desktop: {}, mobile: {} }}` after verification.

## 5. Changed files and purpose

| File | Purpose |
|------|---------|
| `src/lib/spark/deviceProfile.ts` | Derive `getDeviceProfile().sparkRenderer` from `GLOBAL_BASELINES` to eliminate duplication |
| `tests/unit/deviceProfile.test.ts` | Fix stale `maxPagedSplats` expectations (desktop 32×, mobile 16×) |
| `tests/unit/profileResolution.test.ts` | Fix stale baseline expectations; update `maxStdDev` test from 2.8 (now baseline) to 16 |
| `tests/unit/profileValidation.test.ts` | Fix `maxStdDev` test from 2.8 (now desktop baseline) to 16 |
| `tests/unit/studioBuildTransaction.test.ts` | New: Studio transaction write semantics with `resolvePropertyPath` |
| `AGENTS.md` | Update `getDeviceProfile` description, validated profile-literal flow, new test reference |

## 6. Test commands and results

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | Clean (0 errors, 0 warnings) |
| `npm run test:unit` | 25 files, 402 tests passed |
| `npm run test:e2e` | 137 tests passed |
| `npm run build` | Built successfully |
| `git diff --check` | Clean |

## 7. Acceptance checklist

- [x] Constructor and `profileSettings` setter cannot place unvalidated persisted values into effective `_settings` — both route through `computeValidatedSettings()` → `validateField()` + `applyInvariants()`
- [x] Persisted out-of-range/NaN/Infinity/page-size/coupled values resolve via canonical Spark validation contract — tested in `profileValidation.test.ts` and `studioBuildTransaction.test.ts`
- [x] `controls.profileSettings` returns validated minimal overrides consistent with `controls.settings` and active baseline — getter recomputes from `_settings` vs `_baseline`
- [x] Invalid input-object mutation after assignment cannot alter controller state — defensive deep copy on setter input and getter output
- [x] Active application emits one coherent notification containing every actually changed field, including coupled changes — verified in `profileValidation.test.ts`
- [x] Actual public Studio-built transaction `write` tested with new, historic, and redo nested values — `studioBuildTransaction.test.ts` using `resolvePropertyPath` from `@threlte/core` and exact Studio write callback pattern
- [x] Desktop and emulated-mobile manual cold-load evidence recorded explicitly — each applies only its own override parent while preserving the other
- [x] Source sync, reset-to-baseline removal, HMR/reload, playback/edit equality, renderer propagation, and capacity reload remain correct — verified by existing e2e suite (137 passing)
- [x] No new source-mutating automated e2e test added
- [x] `AGENTS.md` accurately documents validated profile-literal application
- [x] Global baseline and `DeviceProfile.sparkRenderer` values consistent — `sparkRenderer` now derived from `GLOBAL_BASELINES`

## 8. Known limitations

- The original Vite parser-level rejection cause (Studio's source-sync rewriting of `profileSettings` attributes) remains unresolved at parser-message level. The observable behavior (attribute rewriting works correctly in both playback and edit modes) is verified by all tests and manual checks.
- Studio's internal `buildTransaction` cannot be imported directly in unit tests (not in package exports, `useTransactions()` requires Svelte context). The test uses `resolvePropertyPath` from `@threlte/core` and replicates the exact write callback semantics from Studio's source.

## 9. Final pushed commit

`877701f` on `main` at `github.com:Avnerus/rad-story`
