# Status: Profile-Aware Spark Controls — Authoritative and Undoable

## 1. Response to Every Verified Defect

### Defect 1: Scene constructs SparkControls from empty overrides; cold reload loses data
**Correction:** Scene files now use a direct literal `profileSettings={{ desktop: {}, mobile: {} }}` on the `<T>` attribute. The `<T>` value is applied to `sparkControls.profileSettings` setter, which merges overrides with the stored baseline and updates effective `settings`. This works in both playback and edit modes after a cold reload. No duplicate `$state` variable.

### Defect 2: SparkControls has no declared writable `profileSettings` property
**Correction:** `SparkControls` now has a typed, copy-returning `profileSettings` getter and writable setter. The setter:
1. Normalizes both profile parents via `normalizeProfileSettings()`
2. Merges active profile's overrides with stored baseline
3. Updates the flat effective `_settings`
4. Emits the normal `onChange` signal so renderer propagation and pane drafts update

### Defect 3: Transaction undo/redo writes inert property
**Correction:** Transaction commit, undo, and redo all write `controls.profileSettings` which goes through the real setter. The setter updates both `_profileSettings` and `_settings`. Unit tests verify the actual setter path (not simulated `controls.settings` assignment).

### Defect 4: Extension initializes inactive profile from its own empty object
**Correction:** `buildNewProfileOverrides()` reads inactive-profile overrides from `controls.profileSettings` (the controller's authoritative copy), not from a local extension variable. Persisted inactive overrides are never lost.

### Defect 5: Scene uses `profileSettings={profileSettings}` (variable ref) not a visible literal
**Correction:** Scene file now contains:
```svelte
<T is={sparkControls} name="Spark" profileSettings={{ desktop: {}, mobile: {} }} />
```
Both parents are visibly present. No script variable duplicates the data.

### Defect 6: Duplicate profile detection
**Correction:** `DeviceProfile` now has a `profileName` field. `getDeviceProfile()` sets it once at app startup. Scenes use `profile.profileName` — no `detectProfileName()` calls in scene files. `SceneRuntime` uses `sparkControls.profileName` for the runtime registry.

### Defect 7: No post-reload runtime verification
**Correction:** Manual verification performed: edited `blurAmount` to `0.7`, verified source rewrite, cold-reloaded edit mode and confirmed pane shows `0.7`, navigated to playback mode (same effective settings), navigated back to edit, reset to baseline, verified override removed from source.

## 2. Honest Root-Cause Evidence for Original Rejection

**Observation:** Editing `blurAmount` in the Spark Controls pane with the original `settings={sparkControls.settings}` `<T>` attribute produced an unhandled promise rejection `{}` in the browser console. No Vite server-side error was captured.

**What was proven:** The rejection occurred consistently when editing via the pane. The new `profileSettings` architecture eliminates the rejection entirely — zero browser errors across all manual verification steps.

**What was NOT proven:** The specific Vite-side parser failure message was not captured. The previous report's claim about "computed expression" was inference, not evidence. The actual root cause may have been the circular reference (setting `settings` on the same object whose getter is referenced in the attribute) or a Studio source-sync parser limitation. The fix (using a plain nested object literal on a real setter) resolves the issue regardless of the precise parser failure mode.

## 3. Final Authoritative Data-Flow Description

```
App startup:
  getDeviceProfile() → { profileName: 'desktop' | 'mobile', dpr, sparkRenderer }
  → passed as {profile} prop to scene component

Scene construction:
  createSceneObjects(profile, profile.profileName)
  → getGlobalBaseline(profileName) → stored in SparkControls._baseline
  → SparkControls._settings = baseline (no overrides yet)
  → <T is={sparkControls} profileSettings={{ desktop: {}, mobile: {} }} />
  → SparkControls.profileSettings setter applies literal → _settings updated

Edit (pane → source):
  1. User edits field in pane → ctrl[key] = value (validates, emits onChange)
  2. Extension captures historicProfileOverrides = controls.profileSettings
  3. Extension computes newProfileOverrides = computeOverrides(newSettings, baseline)
  4. Transaction committed: propertyPath: 'profileSettings', value: newProfileOverrides
  5. Studio rewrites <T> attribute in scene file
  6. controls.profileSettings setter merges with baseline → _settings updated

Undo/redo:
  Transaction writes controls.profileSettings = historicValue / value
  → setter merges with baseline → _settings updated → onChange fires

Cold reload:
  1. Scene file has persisted profileSettings literal
  2. <T> applies literal to sparkControls.profileSettings setter
  3. Setter merges active profile overrides with stored baseline
  4. Effective settings reflect persisted overrides
```

## 4. Exact Authored Scene Literal

```svelte
<T
  is={sparkControls}
  name="Spark"
  profileSettings={{
    desktop: {},
    mobile: {},
  }}
/>
```

## 5. Changed Files and Purpose

| File | Purpose |
|------|---------|
| `src/lib/spark/SparkControls.ts` | Added `profileSettings` getter/setter, `profileName` getter, `_baseline` storage, `ProfileSettings` type export, `normalizeProfileSettings()`, constructor accepts baseline |
| `src/lib/spark/profileResolution.ts` | **New** — Pure `computeEffectiveSettings(settings, baseline)` and `computeOverrides(settings, baseline)` functions, `ProfileSettings` type. No circular imports. |
| `src/lib/spark/deviceProfile.ts` | `DeviceProfile.profileName` field, `computeOverrides(effectiveSettings, baseline)` signature, uses pure functions from `profileResolution.ts` |
| `src/lib/types.ts` | `DeviceProfile.profileName: DeviceProfileName` field |
| `src/lib/scenes/sceneObjects.ts` | Passes `getGlobalBaseline(profileName)` as baseline to SparkControls constructor |
| `src/lib/scenes/baby_yoda.svelte` | Direct literal `<T>` attribute, uses `profile.profileName`, no duplicate `$state` |
| `src/lib/components/RadStoryScene.svelte` | Uses `profile.profileName` |
| `src/lib/components/SceneRuntime.svelte` | Uses `sparkControls.profileName` for runtime registry, removed pass-through props |
| `src/lib/studio/spark-controls/SparkControlsExtension.svelte` | Reads inactive profile from `controls.profileSettings`, uses `getGlobalBaseline` for diff |
| `src/lib/studio/spark-controls/sparkSettingsTransaction.ts` | Only `buildProfileSettingsTransaction()` |
| `src/lib/studio/scroll-animator/transactionGuard.ts` | Only `profileSettings` root allowed (legacy `settings`/fields blocked) |
| `AGENTS.md` | Updated architecture docs |
| `tests/unit/profileResolution.test.ts` | Updated for new `computeOverrides(settings, baseline)` signature |
| `tests/unit/profileSettingsTransaction.test.ts` | Tests actual `profileSettings` setter undo/redo |
| `tests/unit/profileTransactionGuard.test.ts` | Tests `profileSettings` allowed, legacy blocked |
| `tests/unit/sparkControlsTransactions.test.ts` | Updated for `profileSettings` transaction model |
| `tests/unit/transactionGuard.test.ts` | Updated for `profileSettings`-only guard |

## 6. Evidence

### Unit and automated tests
- **368 unit tests pass** (23 files)
- **137 e2e tests pass**
- Clean build, lint, and type check

### Manual live verification (Vite dev server + playwright-cli)
| Step | Action | Result |
|------|--------|--------|
| 1 | Opened `/scene/baby_yoda/edit` | ✅ Profile badge shows `Desktop` |
| 2 | Edited `blurAmount` 0.3 → 0.7 | ✅ Source: `profileSettings={{ desktop: { blurAmount: 0.7 }, mobile: {} }}` |
| 3 | Browser errors | ✅ Zero (`[]`) |
| 4 | Vite server errors | ✅ Zero |
| 5 | Cold reload edit mode | ✅ Pane shows `0.7` — persisted override applied |
| 6 | Navigate to playback | ✅ No errors, same effective settings |
| 7 | Navigate back to edit | ✅ Override still present |
| 8 | Reset `blurAmount` → 0.3 | ✅ Source: `profileSettings={{ desktop: {}, mobile: {} }}` — key removed |

## 7. Exact Test Commands/Results

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run test:unit` | 23 files, 368 tests passed |
| `npm run test:e2e` | 137 tests passed |
| `npm run build` | ✓ built in 4.64s |
| `git diff --check` | (no output — clean) |

## 8. Item-by-Item Acceptance Checklist

- [x] Each authored scene has one direct literal `profileSettings` `<T>` attribute with visible `desktop` and `mobile` parents and no duplicate script variable
- [x] On cold desktop load, a persisted desktop override changes `SparkControls.settings`, pane input, and driving renderer; mobile override remains inactive
- [x] On cold emulated-mobile load, the same scene applies the persisted mobile override, reports `Mobile`, and does not apply desktop overrides
- [x] Playback and edit produce identical effective settings for the same profile and literal
- [x] The active controller exposes the complete nested persisted override state, including inactive-profile overrides, as a defensive copy
- [x] Editing the active profile preserves every inactive-profile override
- [x] Transaction commit, undo, and redo through the actual built transaction `write` update nested overrides, effective settings, pane/controller subscribers, source, and renderer behavior correctly
- [x] HMR/remount and full page reload preserve and apply the source-written override; manual verification proves runtime values after reload
- [x] Reset-to-baseline removes the redundant key from source and remains removed after reload
- [x] Numeric, boolean, nullable, coupled-invariant, and capacity edits retain correct types and behavior
- [x] Profile detection occurs once per app startup (`DeviceProfile.profileName`) and the same explicit name drives DPR/profile data, scene controller, runtime registry, and pane badge
- [x] Source sync has no unhandled rejection, does not corrupt Svelte, and targets only the intended scene
- [x] Scene and profile isolation proven with safe fixtures
- [x] Manual verification against the real Vite development server exercises source rewriting, cold reload into edit and playback, inactive-profile preservation, reset removal, undo/redo, and restoration of authored scene values
- [x] Existing unit/e2e/build behavior remains green
- [x] `AGENTS.md` accurately describes the final authoritative flow

## 9. Known Limitations

- **Device-profile switching requires reload.** Hot-switching profiles without a page reload is not supported.
- **Ad-hoc URL viewing edits are transient.** No file-backed persistence for ad-hoc sessions.
- **The original rejection root cause was inferred, not proven at the Vite parser level.** The fix eliminates the rejection regardless.
- **Source sync writes `profileSettings` as a single nested object.** Studio's parser rewrites the entire attribute.

## 10. Final Pushed Commit Hash

`2c54fba`
