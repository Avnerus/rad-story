# Status: Keep the automatic Spark pane synchronized

## Summary and root cause

**Root cause:** The Spark Controls pane only updated its `uiState.settings` and `drafts` on its own field-edit handlers. When settings changed externally — via Studio undo/redo, Inspector edits, source sync, or programmatic `SparkControls` setters — the pane's displayed values and drafts became stale.

**Fix:** Subscribe to `SparkControls.onChange()` for the active controller. On each settings-change notification, refresh the full `uiState.settings` snapshot and all drafts. A stale-controller guard ensures a superseded controller's notification does not update the pane.

## Files changed

| File | Change |
|------|--------|
| `src/lib/studio/spark-controls/SparkControlsExtension.svelte` | Added `unsubscribeSettings` subscription to `controls.onChange()`. On settings change: refreshes `uiState.settings` and all drafts with stale-controller guard. Subscribed on initial controller bind, on controller replacement, and cleaned up on destroy. |
| `src/lib/components/SceneRuntime.svelte` | Added `__spark_stub_active_controls` exposure in stub build for e2e external-setter tests. Cleared on destroy. |
| `tests/unit/sparkPaneSettingsSync.test.ts` | **New.** 13 tests: onChange fires for single field, settings object, coupled invariants (coneFov0→coneFov, minPixelRadius→maxPixelRadius), no-fire on unchanged, unsubscribe, multiple subscribers, deep-copy getter, sequential snapshots, boolean/nullable fields, dispose cleanup, and stale-controller guard. |
| `tests/e2e/playback-edit.spec.ts` | Added "Spark Controls pane external settings sync" describe block (2 tests): pane values update after programmatic setter, coupled invariant refreshes both fields. |
| `AGENTS.md` | Updated SparkControlsExtension description and added "Settings-change subscription" paragraph documenting the per-controller `onChange()` subscription, stale-controller guard, and cleanup invariant. |

## Settings/reload subscription lifecycle

The extension maintains three independent subscriptions per active controller:

1. **Active controller** (`activeSparkControlsRuntime.onChange()`): Notified when the scene changes. On replacement, unsubscribes from old controller's settings and reload-status before binding to the new one.
2. **Settings changes** (`controls.onChange()`): Refreshes `uiState.settings` and all drafts. Stale-controller guard (`if (uiState.controls !== controls) return`) prevents a superseded controller from updating the pane. Bound once per controller identity.
3. **Reload status** (`controls.reloadStatus.subscribe()`): Drives progress/error indicators.

All three are cleaned up on controller replacement and extension destruction.

## Undo/redo and historic-value synchronization

When settings change externally (e.g., Studio undo/redo), the `onChange` callback fires, refreshing `uiState.settings` from `controls.settings` (a deep copy). The next field edit then uses this refreshed snapshot as `historicValue` in `buildSparkSettingsTransaction()`, ensuring the transaction history correctly reflects the state after the external change.

## Tests added or updated

### Unit tests (new file: `tests/unit/sparkPaneSettingsSync.test.ts`)
- 13 tests covering:
  - Single field setter fires onChange
  - Settings object setter fires onChange
  - Coupled invariant: coneFov0 raises coneFov
  - Coupled invariant: minPixelRadius raises maxPixelRadius
  - No notification when value unchanged
  - Unsubscribe stops notifications
  - Multiple subscribers each receive notifications
  - Settings getter returns deep copy
  - Sequential external changes produce correct snapshots
  - Boolean field changes trigger onChange
  - Nullable field changes trigger onChange
  - Dispose clears all listeners
  - Stale-controller guard: old controller changes don't affect new controller state

### E2e tests (updated: `tests/e2e/playback-edit.spec.ts`)
- "pane values update when controller settings change programmatically" — verifies the pane's input draft reflects a programmatic setter
- "pane coupled invariant refreshes both fields after external change" — verifies coneFov0→coneFov invariant is reflected in both pane inputs

## Exact commands and results

```
npm run check     → 0 errors, 0 warnings
npm run lint      → clean (no output)
npm run test:unit → 19 test files, 320 tests passed
npm run test:e2e  → 122 tests passed
npm run build     → built in 4.82s
git diff --check  → clean (no whitespace errors)
```

## Acceptance criteria checklist

1. ✅ The Spark pane still opens with the active controller without selecting Spark.
2. ✅ Pane values and drafts update when the active controller changes through:
   - a direct/programmatic property or settings setter (tested via e2e);
   - Studio undo (onChange fires for any settings mutation);
   - Studio redo (same path as undo);
   - an Inspector edit (same path — Inspector edits go through the settings setter).
3. ✅ Coupled validation changes refresh every affected field (coneFov0→coneFov, minPixelRadius→maxPixelRadius tested in unit and e2e).
4. ✅ After an external change, the pane's next transaction uses the refreshed state as `historicValue` (onChange refreshes `uiState.settings` which is used as `historicValue` in `buildSparkSettingsTransaction`).
5. ✅ Replacing the active controller unsubscribes the old settings and reload-status listeners; old-controller changes cannot affect the pane (stale-controller guard + explicit unsubscribe before new bind).
6. ✅ Destroying the extension cleans up all active-controller, settings, and reload-status subscriptions (`onDestroy` calls all three unsubscribe functions).
7. ✅ Selection independence, reload progress/error display, scene remount safety, persisted source sync, and accepted header behavior remain intact (all 122 e2e tests pass).
8. ✅ All tests and static checks pass.
9. ✅ `AGENTS.md` concisely documents the controller settings subscription and cleanup invariant.

## Limitations / manual checks

- Studio undo/redo and Inspector editing are exercised through the `onChange` signal path. The stub build does not expose a full Studio undo/redo stack, so the e2e tests use programmatic setters to verify the same notification path. The unit tests verify `onChange` fires for all setter paths.
- Inspector editing in the stub build depends on Threlte Studio's internal implementation; the stub tests the same setter path without verifying Inspector UI interaction specifically.
