# Follow-up mission: Keep the automatic Spark pane synchronized

## Objective

Fix the remaining regression in the selection-independent Spark Controls pane: when the active controller changes settings outside the pane's own input handler—especially through Studio undo/redo, Inspector edits, source sync, or another programmatic controller setter—the open pane must immediately refresh its settings and drafts.

The active-controller runtime, selection-independent behavior, and edit-route header implementation are otherwise accepted.

## Files likely involved

- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- A small extracted synchronization helper only if it materially improves testability
- Relevant Spark Controls unit tests
- Relevant Spark Controls e2e tests
- `AGENTS.md`

## Constraints and implementation guidance

- `SparkControls` already exposes `onChange(fn)` and returns an unsubscribe function. Subscribe to this signal for the active controller.
- When `activeSparkControlsRuntime` publishes a different controller:
  - unsubscribe from both the old settings-change subscription and old reload-status subscription;
  - bind to the new controller;
  - initialize the full settings snapshot and all drafts;
  - subscribe to its settings and reload-status signals.
- On a settings-change notification, refresh `uiState.settings` from the controller's copy-returning `settings` getter and refresh all drafts so coupled validation changes are represented too.
- Cleanup must be idempotent on controller replacement and extension destruction.
- A stale controller notification must not update the pane after a newer controller has become active. Cleanup/identity checks should make this explicit.
- Preserve correct transaction history: the pane's `historicValue` for the next edit must represent the latest controller state, including a preceding undo, redo, Inspector edit, or programmatic change.
- Avoid reintroducing hierarchy-selection dependencies or using Studio transactions merely as a proxy for controller changes. The controller's `onChange()` is the authoritative signal.
- Avoid resubscribing on every field edit. Bind once per active-controller identity.

Critical shape only:

```ts
unsubscribeSettings = controls.onChange(() => {
  if (uiState.controls !== controls) return
  uiState.settings = controls.settings
  refreshDrafts(controls)
})
```

## Acceptance criteria

1. The Spark pane still opens with the active controller without selecting `Spark`.
2. Pane values and drafts update when the active controller changes through:
   - a direct/programmatic property or `settings` setter;
   - Studio undo;
   - Studio redo;
   - an Inspector edit, where supported by the test environment.
3. Coupled validation changes refresh every affected field, not only the edited field.
4. After an external change, the pane's next transaction uses the refreshed state as `historicValue`.
5. Replacing the active controller unsubscribes the old settings and reload-status listeners; old-controller changes cannot affect the pane.
6. Destroying the extension cleans up all active-controller, settings, and reload-status subscriptions.
7. Selection independence, reload progress/error display, scene remount safety, persisted source sync, and the accepted header behavior remain intact.
8. All tests and static checks pass.
9. `AGENTS.md` concisely documents the controller settings subscription and cleanup invariant.

Re-check every acceptance criterion before finalizing.

## Tests to add or update

- Add focused tests proving controller settings notifications refresh:
  - full settings snapshot;
  - all drafts, including a coupled invariant pair;
  - the historic snapshot used by the next edit.
- Test controller replacement:
  - new controller updates are observed;
  - old controller updates are ignored;
  - subscriptions are released on replacement and destroy.
- Add an integration/e2e regression covering an open pane across undo and redo. Assert the visible field value changes with the controller, then make another pane edit and verify undo history/source-sync semantics remain correct.
- Cover Inspector editing if the stub Studio exposes a reliable public interaction; otherwise cover the same external-setter path and report the Inspector limitation clearly.
- Preserve the existing selection-change and mid-reload tests.
- Run:
  - `npm run check`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run build`
  - `git diff --check`

Create new regression assertions for this defect.

## Things Pi must not change

- Do not change the accepted active-controller runtime or header behavior unless a minimal lifecycle correction is strictly required.
- Do not restore selection-based Spark pane behavior.
- Do not introduce SPA playback/edit transitions.
- Do not change route contracts or add a `/scenes` route.
- Do not revisit the resolved gizmo/render-mode issue.
- Do not alter Spark defaults, validation, renderer propagation, reload coordination, transaction guards, or scene persistence semantics.
- Do not refactor unrelated code.
- Do not modify unrelated user work, including `package-lock.json`.

## Documentation

Update `AGENTS.md` with concise current information and source references describing:

- the Spark pane's per-active-controller `onChange()` subscription;
- refreshing the full settings/drafts snapshot;
- cleanup and stale-controller protection;
- why hierarchy selection is unrelated.

Do not add a chronological implementation log.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary and root cause.
2. Files changed and why.
3. Settings/reload subscription lifecycle.
4. Undo/redo and historic-value synchronization evidence.
5. Tests added or updated.
6. Exact commands and results.
7. Explicit acceptance-criteria checklist.
8. Limitations or manual checks.
9. Final pushed commit hash.

Always write `status.md` as the last action before committing and pushing. After writing it, perform no further verification or modification. Push the completed follow-up to the current branch.
