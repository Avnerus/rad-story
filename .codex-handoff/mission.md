# Follow-up mission: Preserve Spark transaction history with synchronous settings sync

## Objective

Fix the transaction-ordering regression introduced by the new `SparkControls.onChange()` pane subscription.

`SparkControls` emits `onChange()` synchronously inside its setters. The subscription refreshes `uiState.settings` to the new state before `handleFieldChange()` or `handleBooleanChange()` builds its transaction. Consequently, the current code can pass the same new snapshot as both `value` and `historicValue`, breaking Studio undo/history.

External-change synchronization is otherwise accepted and must remain.

## Files likely involved

- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `src/lib/studio/spark-controls/sparkSettingsTransaction.ts` only if a small production helper is useful
- `src/lib/components/SceneRuntime.svelte`
- Focused Spark transaction unit/e2e tests
- `AGENTS.md`

## Constraints and implementation guidance

- Capture a complete historic settings snapshot **before** mutating the controller in both numeric/nullable and boolean edit paths.
- After the setter validates and synchronously notifies listeners, capture the complete new settings snapshot.
- Build the transaction with:
  - `value`: post-setter validated settings;
  - `historicValue`: pre-setter settings.
- Do not depend on notification timing or `uiState.settings` for the pane-originated edit's historic snapshot. The controller's copy-returning `settings` getter is the safest source immediately before mutation.
- Preserve coupled invariant changes in the new snapshot.
- Do not suppress the `onChange()` subscription during pane edits; it must continue refreshing all displayed drafts.
- Avoid duplicate transactions for unchanged/normalized-to-current values.
- Apply identical ordering semantics to boolean inputs.

Critical pattern:

```ts
const historicSettings = controls.settings
ctrl[key] = raw
const newSettings = controls.settings

buildSparkSettingsTransaction(controls, newSettings, historicSettings)
```

Also make the stub-only `__spark_stub_active_controls` cleanup in `SceneRuntime` identity-safe: an older scene's destroy must delete the diagnostic only when it still points to that scene's `sparkControls`. This keeps the diagnostic consistent with the production runtime's stale-detach guarantee.

## Acceptance criteria

1. Pane-originated numeric, nullable, and boolean edits build transactions whose `historicValue` is the complete pre-edit snapshot and whose `value` is the complete validated post-edit snapshot.
2. `historicValue` and `value` remain distinct when a setting changes, including when the synchronous `onChange()` callback refreshes pane state.
3. Coupled validation changes appear only in the new snapshot while the historic snapshot remains unchanged.
4. Undo restores the pre-edit settings and redo restores the post-edit settings using the actual transaction snapshots.
5. External programmatic/Inspector/undo/redo changes continue refreshing the open pane and all drafts.
6. Unchanged edits do not create transactions.
7. Boolean and nullable edit paths have the same correct history semantics as numeric edits.
8. Stub active-controller cleanup cannot erase a newer controller reference.
9. Selection independence, subscription cleanup, reload status, header behavior, routing, persistence, and all prior accepted behavior remain intact.
10. `AGENTS.md` documents the pre-mutation historic-snapshot invariant concisely.

Re-check every criterion before finalizing.

## Tests to add or update

- Add a focused production-path regression test that simulates the synchronous listener ordering:
  1. capture historic snapshot;
  2. set a field, causing `onChange()` immediately;
  3. build/commit the transaction;
  4. assert `historicValue` has the old value and `value` has the new value.
- Cover:
  - ordinary numeric edit;
  - coupled-invariant numeric edit;
  - boolean edit;
  - nullable edit;
  - unchanged edit produces no transaction.
- Apply the transaction snapshots through the writable `settings` setter to prove undo and redo restore the expected complete states.
- Add or update a lifecycle test for identity-safe clearing of `__spark_stub_active_controls` if practical.
- Preserve external-change synchronization and selection-independence tests.
- Run:
  - `npm run check`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run build`
  - `git diff --check`

## Things Pi must not change

- Do not remove, defer, or silence the `SparkControls.onChange()` subscription.
- Do not restore selection-based pane behavior.
- Do not change the active-controller architecture except for the identity-safe stub diagnostic cleanup.
- Do not change accepted route/header behavior or add SPA transitions.
- Do not add a `/scenes` route.
- Do not revisit the resolved gizmo/render-mode issue.
- Do not alter Spark defaults, validation, renderer propagation, reload coordination, transaction guards, or persistence semantics.
- Do not refactor unrelated code.
- Do not modify unrelated user work, including `package-lock.json`.

## Documentation

Update `AGENTS.md` with concise current information and source references explaining that pane-originated edits capture `historicValue` before invoking synchronous Spark setters, while the `onChange()` subscription remains responsible for refreshing the pane.

Do not add an implementation log.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Root cause and exact ordering fix.
2. Files changed and why.
3. Old/new transaction snapshot evidence for every input type.
4. Undo/redo evidence.
5. Stub diagnostic identity-safety change.
6. Tests and exact results.
7. Explicit acceptance-criteria checklist.
8. Limitations or manual checks.
9. Final pushed commit hash.

Always write `status.md` as the last action before committing and pushing. After writing it, perform no further verification or modification. Push the completed follow-up to the current branch.
