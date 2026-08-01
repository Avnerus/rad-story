# Final follow-up mission: validate persisted profile overrides through the canonical Spark path

## Objective

Preserve the now-correct authoritative scene-literal/profile transaction architecture, but close the remaining validation and verification gaps before acceptance.

The cold-reload persistence flow is structurally correct: a direct scene `<T profileSettings={{ desktop: ..., mobile: ... }}>` writes through a real `SparkControls.profileSettings` setter, and undo/redo will target that property. However, persisted overrides are currently merged directly into `_settings` in both the constructor and `profileSettings` setter. This bypasses the controller's canonical validation, clamping, `maxPagedSplats` page rounding, and coupled invariants.

## Verified issues

1. `SparkControls` constructor copies active profile override values directly into `_settings`.
2. `SparkControls.profileSettings` setter also copies override values directly into `_settings`.
3. Therefore a hand-authored, stale, or historic scene literal can bypass `validateField()` and `applyInvariants()`, despite `AGENTS.md` claiming all values use the same validation path.
4. The updated “undo/redo” unit tests assign `controls.profileSettings` manually. They do not exercise the actual transaction returned by Studio's public `buildTransaction()` and its `write` callback as the previous mission required.
5. The completion report checks the mobile cold-load acceptance item, but its manual evidence table documents only desktop. Provide real mobile-emulation evidence or mark it unverified; do not infer it solely from unit tests.

## Files likely involved

- `src/lib/spark/SparkControls.ts`
- `src/lib/spark/profileResolution.ts` if a pure validated-resolution boundary is helpful
- `src/lib/spark/deviceProfile.ts` if baseline duplication should be consolidated
- `tests/unit/profileSettingsTransaction.test.ts`
- `tests/unit/sparkControlsTransactions.test.ts`
- Focused validation/profile tests
- `AGENTS.md`

## Constraints

- Keep the direct scene literal, real writable `profileSettings`, single detected `DeviceProfile.profileName`, minimal active-profile deltas, inactive-profile preservation, and `profileSettings`-only transaction guard.
- Route constructor-time and setter-time effective settings through the same canonical field validation and coupled-invariant semantics as ordinary `settings`/individual field edits.
- Cover NaN/Infinity fallback, numeric bounds, `maxPagedSplats` page rounding, `coneFov0 <= coneFov`, and `minPixelRadius <= maxPixelRadius` for persisted profile overrides.
- Decide and document normalization semantics precisely:
  - runtime effective settings must always be validated;
  - the controller's copy-returning `profileSettings` must represent the validated/minimal authoritative overrides used by transactions, not retain invalid values that disagree with runtime;
  - both `desktop` and `mobile` parents remain present;
  - inactive-profile overrides must not be erased while editing the active profile.
- Avoid duplicate notification bursts. Applying `profileSettings` should publish one coherent changed-key set when effective settings change, including coupled fields.
- Preserve defensive-copy behavior for both getter and setter input; later mutation of the caller's nested object must not mutate controller state or a transaction snapshot.
- Use the existing public Studio transaction builder in a focused unit test and invoke the built transaction's actual `write` callback for forward/historic/redo values. Assert nested overrides, effective settings, and change notifications after each write. A mock that merely calls the setter separately is insufficient.
- Manual Vite source-sync verification remains sufficient; do not add a new automated source-mutating e2e test.
- Manually verify one desktop and one emulated-mobile cold load using non-empty overrides under both parents. Confirm badge, pane value, controller/renderer value, inactive-profile isolation, source rewrite, reset, undo/redo, and no browser/Vite error. Restore the authored scene literal afterward.
- Keep global baseline and `DeviceProfile.sparkRenderer` values consistent. Prefer deriving duplicated profile fields from one canonical table if it can be done narrowly.
- Do not revisit the unproven original Vite rejection cause. Continue describing it as unresolved at parser-message level.
- Avoid unrelated refactors.

## Acceptance criteria

- Constructor and `profileSettings` setter cannot place unvalidated persisted values into effective `_settings`.
- Persisted out-of-range/NaN/Infinity/page-size/coupled values resolve exactly as the existing canonical Spark validation contract specifies.
- `controls.profileSettings` returns validated minimal overrides consistent with `controls.settings` and the active baseline.
- Invalid input-object mutation after assignment cannot alter controller state.
- Active application emits one coherent notification containing every actually changed field, including coupled changes.
- The actual public Studio-built transaction `write` is tested with new, historic, and redo nested values; each updates `profileSettings`, effective `settings`, and notifications correctly.
- Desktop and emulated-mobile manual cold-load evidence is recorded explicitly. Each applies only its own override parent while preserving the other.
- Source sync, reset-to-baseline removal, HMR/reload, playback/edit equality, renderer propagation, and capacity reload remain correct.
- No new source-mutating automated e2e test is required; existing e2e tests continue to pass.
- `AGENTS.md` accurately documents validated profile-literal application.
- Re-check every criterion before finalizing.

## Tests and verification

Add focused unit coverage for:

- constructor validation of active profile overrides;
- `profileSettings` setter validation and normalization;
- page rounding and both coupled invariant families;
- fallback for NaN/Infinity or malformed runtime input;
- defensive copy on setter input and getter output;
- coherent notification changed-key set;
- actual public transaction `write` for commit/undo/redo.

Manually verify desktop and emulated mobile against `npm run dev`, then restore the scene source.

Run and report:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`
- `git diff --check`

## Things Pi must not change

- Do not revert to `settings={sparkControls.settings}` or a duplicate script `$state` override object.
- Do not flatten or fully materialize baseline-equal scene settings.
- Do not weaken profile isolation or the `profileSettings`-only sync guard.
- Do not add a source-mutating automated e2e test; manual live verification is sufficient.
- Do not patch Studio, suppress sync errors, or assert an unobserved Vite root cause.
- Do not change unrelated rendering, reload, routing, camera, ScrollAnimator, ad-hoc, or FPS behavior.
- Do not commit manual test values, generated output, or unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Exact validation gap and correction.
2. Constructor/setter normalization and notification semantics.
3. Evidence from the actual public transaction `write` test.
4. Separate desktop and emulated-mobile manual cold-load evidence.
5. Changed files and purpose.
6. Exact test commands/results.
7. Item-by-item acceptance checklist.
8. Known limitations, retaining the honest statement that the original Vite parser-level cause was not captured.
9. Final pushed commit hash.

Update `AGENTS.md` concisely with the validated authoritative flow and relevant source/test references.

Always write `.codex-handoff/status.md` as the last action before pushing. Immediately beforehand, re-check all acceptance criteria. After writing the report and pushing all intended code, tests, documentation, and report changes, do not perform further verification or modification.
