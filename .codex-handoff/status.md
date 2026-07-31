# Status: Preserve Spark transaction history with synchronous settings sync

## Root cause and exact ordering fix

**Root cause:** `SparkControls.onChange()` fires synchronously inside its setters. The pane's `onChange` subscription refreshes `uiState.settings` to the new state *before* `handleFieldChange()` or `handleBooleanChange()` builds its transaction. Since the code used `uiState.settings` as `historicValue`, both `value` and `historicValue` were the same (post-edit) snapshot, breaking Studio undo/history.

**Fix:** Both `handleFieldChange()` and `handleBooleanChange()` now capture `historicSettings = controls.settings` **before** invoking the setter, then capture `newSettings = controls.settings` **after**. The transaction is built with `value: newSettings` and `historicValue: historicSettings`. The `onChange` subscription is not suppressed — it continues refreshing all displayed drafts.

## Files changed

| File | Change |
|------|--------|
| `src/lib/studio/spark-controls/SparkControlsExtension.svelte` | Both `handleFieldChange()` and `handleBooleanChange()` now capture pre-setter `historicSettings` and post-setter `newSettings`. Transactions use these explicit snapshots instead of `uiState.settings`. Unchanged edits (where `historicSettings[key] === newSettings[key]`) produce no transaction. Removed redundant `uiState.settings`/`refreshDrafts` calls after setter (already done by synchronous `onChange`). |
| `src/lib/components/SceneRuntime.svelte` | Made `__spark_stub_active_controls` cleanup identity-safe: only deletes the diagnostic if it still points to this scene's `sparkControls` (matching the production runtime's stale-detach guarantee). |
| `tests/unit/sparkPaneTransactionOrdering.test.ts` | **New.** 10 tests covering: numeric/boolean/nullable edit snapshot ordering, coupled invariant snapshots, unchanged edit (no transaction), settings setter distinctness, sequential edits with correct historic/value chains, undo/redo simulation via settings setter, pane onChange continuing after pane-originated edits, and stale-controller guard with synchronous onChange. |
| `tests/unit/activeSparkControlsRuntime.test.ts` | Added 3 stub diagnostic identity-safety tests: old scene destroy doesn't clear newer scene, single scene destroy clears, and destroy when no diagnostic is safe. |
| `AGENTS.md` | Added "Pre-mutation historic-snapshot invariant" paragraph documenting the capture-before-setter pattern and why it's necessary. |

## Old/new transaction snapshot evidence for every input type

### Numeric edit (`lodSplatScale = 5`)
- `historicValue.lodSplatScale` = 1 (default, pre-setter)
- `value.lodSplatScale` = 5 (post-setter)
- Verified: distinct snapshots, pane refreshed by synchronous onChange

### Boolean edit (`sortRadial = false`)
- `historicValue.sortRadial` = true (default)
- `value.sortRadial` = false (post-setter)
- Verified: distinct snapshots, pane refreshed

### Nullable edit (`lodSplatCount = 50000`)
- `historicValue.lodSplatCount` = null (default)
- `value.lodSplatCount` = 50000 (post-setter)
- Verified: distinct snapshots, pane refreshed

### Coupled invariant edit (`coneFov0 = 170`)
- `historicValue.coneFov0` = 90, `historicValue.coneFov` = 120 (defaults unchanged)
- `value.coneFov0` = 170, `value.coneFov` = 170 (coneFov raised by invariant)
- Verified: invariant change only in new snapshot, historic preserved

### Unchanged edit (`lodSplatScale = 1` when already 1)
- No transaction created (onChange not fired, `historic[key] === new[key]`)
- Verified: no spurious transaction

## Undo/redo evidence

Unit test "undo/redo simulation" verifies:
1. Edit: `lodSplatScale` 1 → 5, captures `historic` (1) and `new` (5)
2. Undo: `ctrl.settings = historic` restores `lodSplatScale = 1`, pane refreshed
3. Redo: `ctrl.settings = new` restores `lodSplatScale = 5`, pane refreshed
4. Each step fires `onChange`, pane stays in sync

Sequential edits test verifies:
- Edit 1's `value` becomes Edit 2's `historicValue`
- Each transaction has correct pre/post snapshots

## Stub diagnostic identity-safety change

`SceneRuntime.onDestroy()` now checks `if (current === sparkControls)` before deleting `__spark_stub_active_controls`. This mirrors the production `activeSparkControlsRuntime`'s generation-based stale-detach guarantee: an older scene's destroy cannot erase a newer scene's diagnostic reference.

## Tests added or updated

### Unit tests (new file: `tests/unit/sparkPaneTransactionOrdering.test.ts`)
- 10 tests:
  - Numeric edit: historic has old value, value has new value
  - Boolean edit: same pattern
  - Nullable edit: same pattern
  - Coupled invariant: only new snapshot has adjusted field
  - Unchanged edit: no transaction created
  - Settings setter: historic and value distinct
  - Sequential edits: each transaction has correct historic/value
  - Undo/redo simulation: settings setter restores pre/post states
  - Pane onChange continues after pane-originated edits
  - Stale-controller guard with synchronous onChange

### Unit tests (updated: `tests/unit/activeSparkControlsRuntime.test.ts`)
- 3 new tests for stub diagnostic identity-safety

### E2e tests
- All 122 existing tests pass unchanged, confirming no regression

## Exact commands and results

```
npm run check     → 0 errors, 0 warnings
npm run lint      → clean (no output)
npm run test:unit → 20 test files, 333 tests passed
npm run test:e2e  → 122 tests passed
npm run build     → built in 4.79s
git diff --check  → clean (no whitespace errors)
```

## Acceptance criteria checklist

1. ✅ Pane-originated numeric, nullable, and boolean edits build transactions whose `historicValue` is the complete pre-edit snapshot and `value` is the complete validated post-edit snapshot.
2. ✅ `historicValue` and `value` remain distinct when a setting changes, including when the synchronous `onChange()` callback refreshes pane state.
3. ✅ Coupled validation changes appear only in the new snapshot while the historic snapshot remains unchanged.
4. ✅ Undo restores the pre-edit settings and redo restores the post-edit settings using the actual transaction snapshots (verified via settings setter simulation).
5. ✅ External programmatic/Inspector/undo/redo changes continue refreshing the open pane and all drafts (onChange subscription active).
6. ✅ Unchanged edits do not create transactions.
7. ✅ Boolean and nullable edit paths have the same correct history semantics as numeric edits.
8. ✅ Stub active-controller cleanup cannot erase a newer controller reference (identity-safe check).
9. ✅ Selection independence, subscription cleanup, reload status, header behavior, routing, persistence, and all prior accepted behavior remain intact (122 e2e tests pass).
10. ✅ `AGENTS.md` documents the pre-mutation historic-snapshot invariant concisely.

## Limitations / manual checks

- Studio undo/redo is tested via the `settings` setter path (which is what Studio uses to apply undo/redo transactions). The stub build does not expose a full Studio undo/redo stack for direct UI interaction, but the transaction snapshot correctness is verified at the unit level for all input types.
- Inspector editing follows the same setter path and is covered by the same onChange subscription mechanism.
