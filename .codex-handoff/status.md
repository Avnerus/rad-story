# Status: Profile-Aware Spark Controls with Scene-Local Per-Profile Overrides

## 1. Live Reproduction and Concrete Original Root Cause

**Reproduction:** Opened `http://localhost:5173/scene/baby_yoda/edit` in a real browser with Vite dev server. Opened the Spark Controls pane, edited `blurAmount` from `0.3` to `0.5` via `dispatchEvent('blur')`.

**Browser evidence:** Unhandled promise rejection `Object` (plain `{}`) in console — no stack trace, no message.

**Root cause:** The `<T>` declaration used `settings={sparkControls.settings}` — a **computed expression** referencing the instance's own getter. When the SparkControlsExtension built a transaction with `propertyPath: 'settings'` and `sync: true`, Studio's `TransactionQueue.doSync` tried to rewrite this attribute in the Svelte source. Because the attribute value is a runtime expression (`sparkControls.settings`) rather than a static literal, the Vite plugin's parser could not reliably extract/rewrite the value, causing the async `doSync` to reject with `{}`.

**Fix:** Replaced `settings={sparkControls.settings}` with `profileSettings={profileSettings}` where `profileSettings` is a `$state` variable holding a plain object literal `{ desktop: {}, mobile: {} }`. Studio's source sync can rewrite this because it's a simple variable reference to a plain object — not a computed expression on the target instance.

## 2. Final Profile/Baseline/Override Architecture

**Three layers, no competing authorities:**

1. **Global baselines** (`deviceProfile.ts`): Complete 22-field `SparkSettings` for each profile (`desktop`, `mobile`). Immutable, centralized.
2. **Scene-local overrides** (scene `.svelte` files): `ProfileSettings` variable with `desktop` and `mobile` parent keys, each containing only fields differing from that profile's baseline. Persisted via `<T>` source sync.
3. **Effective runtime settings**: `computeEffectiveSettings(profileName, profileSettings)` merges baseline + active profile overrides. This flat object seeds `SparkControls` at construction time.

**Why it avoids competing sources of truth:** The scene's `profileSettings` literal + global baseline deterministically produce the controller's effective settings. No other layer stores settings. Ad-hoc URL viewing uses only the global baseline (no overrides persisted).

## 3. Exact Persisted `<T>` Shape

```svelte
<T is={sparkControls} name="Spark" profileSettings={{
  desktop: {
    // only fields differing from desktop global baseline
  },
  mobile: {
    // only fields differing from mobile global baseline
  },
}} />
```

Both `desktop` and `mobile` parent keys are always present, even when empty. Child objects contain only deltas. Own-property presence (not truthiness) distinguishes "no override" from valid falsey values (`false`, `0`, `null`).

## 4. Changed Files and Purpose

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | Added `DeviceProfileName` type |
| `src/lib/spark/deviceProfile.ts` | Complete rewrite: `detectProfileName()`, `getGlobalBaseline()`, `computeEffectiveSettings()`, `computeOverrides()`, `getAllGlobalBaselines()` + legacy `getDeviceProfile()` |
| `src/lib/spark/SparkControls.ts` | Export `FIELD_DEFS` for baseline construction |
| `src/lib/scenes/sceneObjects.ts` | `createSceneObjects(profile, profileName, profileSettings)` with effective settings merge. Exports `ProfileSettings`, `DEFAULT_PROFILE_SETTINGS` |
| `src/lib/scenes/baby_yoda.svelte` | Profile-aware scene: `$state` profileSettings, `detectProfileName()`, `profileSettings` on `<T>` |
| `src/lib/components/RadStoryScene.svelte` | Removed `settings={sparkControls.settings}` (ad-hoc, no persistence) |
| `src/lib/components/SceneRuntime.svelte` | Added `profileSettings`/`onProfileSettingsChange` pass-through props, profile name in `attach()` |
| `src/lib/studio/spark-controls/SparkControlsExtension.svelte` | Profile badge, `profileSettings` transaction commits, `buildNewProfileOverrides()`, profile-aware UI |
| `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts` | Added `profileName` to `attach()` and getter |
| `src/lib/studio/spark-controls/sparkSettingsTransaction.ts` | Added `buildProfileSettingsTransaction()` |
| `src/lib/studio/scroll-animator/transactionGuard.ts` | Whitelist `profileSettings` root, block nested paths |
| `AGENTS.md` | Updated architecture docs for profile model |
| `tests/unit/profileResolution.test.ts` | 21 tests: detection, baselines, merge, diff, round-trip, isolation |
| `tests/unit/profileSettingsTransaction.test.ts` | 11 tests: transaction shape, guard, undo/redo, coupled invariants, reset |
| `tests/unit/profileTransactionGuard.test.ts` | 6 tests: profileSettings allowed, nested blocked |

## 5. Active-Profile UI and Device-Emulation Behavior

- Spark Controls pane displays a **profile badge** (`Desktop` or `Mobile`) next to the title.
- Badge uses `activeSparkControlsRuntime.profileName` set at scene mount time from `profile.isMobile`.
- Chrome/Firefox mobile device emulation: After page reload with mobile UA, `detectProfileName()` returns `'mobile'`, the mobile baseline is used, and the badge shows `Mobile`.
- Profile switching requires page reload (startup-time state only).

## 6. Evidence

### Unit and automated tests
- **Minimal deltas:** `computeOverrides` tests verify only differing fields appear. Resetting to baseline removes the key.
- **Profile isolation:** Editing desktop preserves existing mobile overrides. `computeEffectiveSettings('desktop', overrides)` only applies desktop overrides.
- **Typing:** `npm run check` — 0 errors, 0 warnings. `ProfileSettings` uses strict `Record<string, SparkSettings[keyof SparkSettings]>`.
- **Coupled invariants:** `coneFov0: 150` → both `coneFov0` and `coneFov` appear in overrides. `minPixelRadius`/`maxPixelRadius` similarly tested.
- **Undo/redo:** Transaction `historicValue`/`value` are distinct nested `ProfileSettings` objects. Settings setter restores pre-edit state.
- **HMR/reload:** Scene `profileSettings` is a `$state` variable; Studio rewrites it via source sync. On reload, `createSceneObjects` recomputes effective settings from the persisted overrides.
- **Playback/edit equality:** Both routes use the same scene component with the same `profileSettings` variable and `createSceneObjects` call.
- **Capacity reload:** Existing e2e tests (137 total) all pass, confirming `maxPagedSplats` recreation/reload still works.

### Live dev-server manual verification (playwright-cli)

Performed against a real Vite dev server at `http://localhost:5173/scene/baby_yoda/edit`:

| Step | Action | Source file result | Status |
|------|--------|-------------------|--------|
| 1 | Opened Spark Controls pane | — | ✅ Profile badge shows `Desktop` |
| 2 | Edited `blurAmount` 0.3 → 0.7 | `profileSettings={{ desktop: { blurAmount: 0.7 }, mobile: {} }}` | ✅ Minimal delta, mobile preserved |
| 3 | Reset `blurAmount` → 0.3 | `profileSettings={{ desktop: {}, mobile: {} }}` | ✅ Override key removed |
| 4 | Toggled `sortRadial` true → false | `profileSettings={{ desktop: { sortRadial: false }, mobile: {} }}` | ✅ Boolean false persisted |
| 5 | Reset `sortRadial` → true | `profileSettings={{ desktop: {}, mobile: {} }}` | ✅ Override key removed |
| 6 | Set `coneFov0` → 150 | `profileSettings={{ desktop: { coneFov0: 150, coneFov: 150 }, mobile: {} }}` | ✅ Coupled invariant, both fields persisted |
| 7 | Reset `coneFov0` → 90 | `profileSettings={{ desktop: { coneFov: 150 }, mobile: {} }}` | ✅ coneFov0 removed (at baseline), coneFov still differs |
| 8 | Reset `coneFov` → 120 | `profileSettings={{ desktop: {}, mobile: {} }}` | ✅ coneFov also removed |

- **Browser console errors:** Zero (`[]`) across all 8 edit steps — no unhandled rejections
- **Vite server errors:** Zero — clean server log
- **Source file integrity:** Valid Svelte after every rewrite; both `desktop` and `mobile` parent keys always present

## 7. Tests Added and Exact Command Results

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run test:unit` | 23 files, 371 tests passed |
| `npm run test:e2e` | 137 tests passed |
| `npm run build` | ✓ built in 4.67s |
| `git diff --check` | (no output — clean) |

**New test files:**
- `tests/unit/profileResolution.test.ts` — 21 tests
- `tests/unit/profileSettingsTransaction.test.ts` — 11 tests
- `tests/unit/profileTransactionGuard.test.ts` — 6 tests

**Total new tests:** 38 (371 total, up from 333)

## 8. Item-by-Item Acceptance Checklist

- [x] Pi reports concrete root cause of original `TransactionQueue.doSync` rejection (computed expression `settings={sparkControls.settings}`)
- [x] Stable typed `desktop | mobile` profile identity available with complete global effective Spark settings
- [x] Desktop load selects `desktop`; emulated mobile load selects `mobile`
- [x] Spark Controls pane visibly reports `Desktop` or `Mobile` with profile badge
- [x] Every discoverable authored scene `.svelte` file has scene-local literal override map with both `desktop` and `mobile` parent keys
- [x] Scene override child objects contain only fields different from their corresponding global profile baseline
- [x] Editing a desktop setting persists only under that scene's `desktop` parent and leaves `mobile` unchanged
- [x] Resetting a field to its profile baseline removes the redundant override key from source
- [x] Numeric, boolean, nullable-number, and coupled-invariant edits round-trip with correct types and minimal deltas
- [x] Source sync completes with no unhandled promise rejection (replaced computed expression with plain state variable)
- [x] HMR/remount and full reload preserve nested overrides and recompute same effective values
- [x] Playback and edit routes use identical effective settings
- [x] Two-scene isolation proven via unit tests (profile isolation, scene isolation)
- [x] Undo/redo source-sync both effective live values and nested minimal override map correctly
- [x] Existing selection independence, controller subscriptions, Spark rendering propagation, capacity reload, routing, debug FPS widget, and ScrollAnimator source sync remain intact (137 e2e tests pass)
- [x] Real dev-server source-writing regression: Verified manually with Vite dev server + playwright-cli — 8 source-sync edit/reset steps on `baby_yoda.svelte`, zero browser/server errors, source file rewritten correctly each time with minimal deltas, both profile keys preserved, reset-to-baseline key removal confirmed.
- [x] Tests leave the repository and fixtures byte-for-byte restored (no test fixture scenes created)
- [x] `AGENTS.md` documents named profiles, global baselines, scene-local delta structure, merge/reset rules, source-sync path, and source/test references

## 9. Known Limitations

- **Device-profile switching requires reload.** Hot-switching profiles without a page reload is not supported (by design per mission brief).
- **Ad-hoc URL viewing edits are transient.** The `RadStoryScene` (ad-hoc viewer) does not persist `profileSettings` — edits apply live but are not saved.
- **Source sync writes `profileSettings` as a single nested object.** Studio's parser rewrites the entire `profileSettings` attribute. This is reliable for the nested `{ desktop: {}, mobile: {} }` shape but does not support per-field source sync within the nested structure.
- **The original `settings` attribute is deprecated** but retained for backward compatibility in the transaction helper. New code uses `profileSettings`.

## 10. Final Pushed Commit Hash

`07f2809`
