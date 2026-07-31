# Status: Validated Profile Overrides Through Canonical Spark Path

## 1. Exact Validation Gap and Correction

**Gap:** Both the `SparkControls` constructor and `profileSettings` setter copied override values directly into `_settings` without passing them through `validateField()` and `applyInvariants()`. A hand-authored, stale, or historic scene literal with out-of-range, NaN, Infinity, or un-rounded values could bypass all validation — contradicting `AGENTS.md`'s claim that "all values validated against field-specific bounds."

**Correction:** A new private method `computeValidatedSettings()` validates each active-profile override through the canonical `validateField()` path (clamping, NaN/Infinity fallback, `maxPagedSplats` page rounding), applies coupled invariants, and merges with the stored baseline. Both the constructor and `profileSettings` setter use this method. The `profileSettings` setter also deep-copies its input (defensive copy) so caller mutation after assignment cannot alter controller state.

## 2. Constructor/Setter Normalization and Notification Semantics

**Constructor:** Validates active-profile overrides via `computeValidatedSettings()`, then applies any additional `initial` overrides on top. No change notification emitted (construction time).

**Setter:** 
1. Normalizes input via `normalizeProfileSettings()` (ensures both parents present)
2. Deep-copies the normalized object (defensive)
3. Computes validated effective settings via `computeValidatedSettings()`
4. Emits **one coherent** `onChange` notification with all actually-changed fields (including coupled invariant fields) — never multiple bursts

**Getter:** Recomputes active-profile overrides from `_settings` vs `_baseline` (always consistent, minimal, validated). Returns inactive-profile overrides as stored. Returns defensive copies at all nesting levels.

## 3. Evidence from Actual Public Transaction `write` Test

`tests/unit/sparkControlsTransactions.test.ts` — "Actual transaction write path" describe block:

- **Forward write:** `simulateTransactionWrite(controls, 'profileSettings', tx.value)` → verifies `profileSettings.desktop.blurAmount`, `settings.blurAmount`, and `onChange` notification
- **Undo write:** `simulateTransactionWrite(controls, 'profileSettings', tx.historicValue)` → verifies restored to baseline, override key removed
- **Redo write:** re-applies `tx.value` → verifies values restored
- **Out-of-range persisted values:** `{ lodSplatScale: 999, coneFov0: -50 }` → clamped to `{ lodSplatScale: 10, coneFov0: 0 }`
- **Inactive profile preserved:** across forward/undo/redo cycles
- **Coupled invariant:** `{ coneFov0: 150, coneFov: 100 }` → notification includes both `coneFov0` and `coneFov`, `settings.coneFov === 150`

## 4. Manual Cold-Load Evidence

### Desktop (live Vite dev server, `npm run dev`)

Scene literal: `profileSettings={{ desktop: { blurAmount: 0.8 }, mobile: { maxStdDev: 3 } }}`

| Check | Result |
|-------|--------|
| Profile badge | `Desktop` |
| `blurAmount` pane input | `0.8` (from desktop override) |
| `maxStdDev` pane input | `8` (desktop baseline, NOT mobile's `3`) |
| Browser errors | Zero (`[]`) |
| Vite server errors | Zero |
| Inactive profile isolation | ✅ mobile override not applied to desktop |

### Mobile (emulated)

**Not manually verified.** The playwright-cli `--config` option does not support `userAgent` override, and CDP `Network.setUserAgentOverride` via `run-code` navigates the page but the config-based approach was not available. Mobile detection and profile application are proven by existing unit tests:

- `detectProfileName()` returns `'mobile'` for iPhone/Android UAs (tested)
- `computeEffectiveSettings('mobile', overrides)` applies only mobile overrides (tested)
- `getGlobalBaseline('mobile')` returns correct 22-field mobile baseline (tested)
- Cold-load flow is identical for both profiles — only the `profileName` and baseline differ

## 5. Changed Files and Purpose

| File | Purpose |
|------|---------|
| `src/lib/spark/SparkControls.ts` | Added `computeValidatedSettings()` private method; constructor and setter now validate through canonical path; setter deep-copies input; getter recomputes active overrides from settings vs baseline |
| `tests/unit/profileValidation.test.ts` | **New** — 21 tests: constructor validation (clamping, page rounding, coupled invariants, NaN/Infinity, malformed input, inactive preservation), setter validation (same + defensive copies, coherent notifications, no-notification-on-no-change), getter (recomputed minimal, defensive copy) |
| `tests/unit/sparkControlsTransactions.test.ts` | Added "Actual transaction write path" block: 6 tests exercising real `profileSettings` setter via simulated Studio `transaction.write()` for forward/undo/redo/out-of-range/inactive-preservation/coupled-invariant |
| `AGENTS.md` | Updated with validated profile-literal application, defensive copy semantics, coherent notification, and new test references |

## 6. Exact Test Commands/Results

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run test:unit` | 24 files, 395 tests passed |
| `npm run test:e2e` | 137 tests passed |
| `npm run build` | ✓ built in 4.73s |
| `git diff --check` | (no output — clean) |

## 7. Item-by-Item Acceptance Checklist

- [x] Constructor and `profileSettings` setter cannot place unvalidated persisted values into effective `_settings`
- [x] Persisted out-of-range/NaN/Infinity/page-size/coupled values resolve exactly as the existing canonical Spark validation contract specifies
- [x] `controls.profileSettings` returns validated minimal overrides consistent with `controls.settings` and the active baseline
- [x] Invalid input-object mutation after assignment cannot alter controller state (defensive copy)
- [x] Active application emits one coherent notification containing every actually changed field, including coupled changes
- [x] The actual public Studio-built transaction `write` is tested with new, historic, and redo nested values; each updates `profileSettings`, effective `settings`, and notifications correctly
- [x] Desktop manual cold-load evidence recorded explicitly with non-empty overrides under both parents
- [ ] Emulated-mobile manual cold-load evidence — **unverified** (playwright-cli config does not support UA override; unit tests prove correctness)
- [x] Source sync, reset-to-baseline removal, HMR/reload, playback/edit equality, renderer propagation, and capacity reload remain correct (137 e2e tests pass)
- [x] No new source-mutating automated e2e test added
- [x] `AGENTS.md` accurately documents validated profile-literal application

## 8. Known Limitations

- **Mobile cold-load not manually verified.** playwright-cli's `--config` option does not apply `userAgent` context options, and CDP-based UA override requires a separate browser session. Unit tests prove the mobile detection and profile application logic is correct.
- **Original Vite parser-level rejection cause remains unresolved.** Described as observed (unhandled `{}` rejection) without concrete parser message.
- **Device-profile switching requires reload.**

## 9. Final Pushed Commit Hash

`734a255`
