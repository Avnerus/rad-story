# Follow-up mission: close Spark configuration and verification gaps

## Objective

Keep the implementation from commit `f4eda32`, but close the remaining gaps
found during Codex verification:

1. Remove the hardcoded Spark fallback values still present in
   `SparkStudioBridge.svelte`; the profile baselines plus scene overrides must
   truly be the only settings source.
2. Make source-sync permission identity-safe for the exact registered
   `SparkControls`, including same-controller re-registration and stale
   transactions.
3. Add the focused tests promised by the previous mission for initial renderer
   settings, runtime capability lifecycle, and the complete `splat_url`
   behavior.
4. Correct documentation/status claims that currently overstate test coverage.

The user accepts the existing replicated Studio transaction-write test. A
test-only import of Studio's unexported `buildTransaction` may be attempted as
an optional small improvement, but must not delay or destabilize this mission.

## Files likely involved

- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/SceneRuntime.svelte`
- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts`
- `src/lib/studio/scroll-animator/transactionGuard.ts`
- optionally a small pure Spark-settings-to-renderer-options helper under
  `src/lib/spark/`
- `tests/unit/activeSparkControlsRuntime.test.ts`
- focused renderer/settings tests under `tests/unit/`
- `tests/unit/profileTransactionGuard.test.ts`
- `tests/e2e/rad-story.spec.ts`
- `tests/e2e/scene-routing.spec.ts` only if needed
- `README.md`, `AGENTS.md`, and `.codex-handoff/status.md`
- optionally `tests/unit/studioBuildTransaction.test.ts`

Do not scan or refactor unrelated code.

## Constraints and required changes

### No fallback configuration duplication

`SparkStudioBridge.svelte` currently says it falls back to the global baseline,
but actually embeds values such as `lodSplatScale: 1`, `maxStdDev: 2.8`, and
`maxPagedSplats: 16 * 65536`. These are another settings source and violate the
mission invariant.

- Make `sparkControls` required wherever `SceneRuntime` and
  `SparkStudioBridge` are used, since every current scene creates it before
  rendering.
- Initialize renderer options only from the complete
  `sparkControls.settings` snapshot.
- If a fallback is architecturally unavoidable, it must be obtained from
  `getGlobalBaseline(sparkControls.profileName)` rather than literal values;
  however, requiring the controller is preferred.
- Centralize conversion of `SparkSettings` to `SparkRendererOptions` if that
  makes all-field testing clearer. Map `lodSplatCount: null` to `undefined`.
- Preserve infrastructure options (`renderer`, `onDirty`,
  `pagedExtSplats`) and the dual-renderer roles.
- Do not claim that `applySettings(initial, initial)` applies fields: it is a
  deliberate no-op under change detection. Constructor options must already be
  complete and correct, or the initialization helper must explicitly apply a
  complete snapshot.

### Identity-safe source-sync permission

The transaction guard currently consults only the global boolean
`activeSparkControlsRuntime.sourceSyncEnabled`. That can make a transaction for
one controller inherit another controller's permission.

- Add an identity-aware API such as
  `activeSparkControlsRuntime.canSourceSync(controls)` that returns true only
  when `controls` is the current active controller and its current registration
  explicitly permits source sync.
- Use that identity-aware check in the transaction guard. A stale/detached or
  non-active Spark controller must never gain permission from a newer
  persistable controller.
- Preserve exact-root `profileSettings` whitelisting for the active persistable
  controller. All nested paths and other attributes remain blocked.
- Re-attaching the same controller with changed profile/capability metadata must
  notify subscribers or otherwise update the pane reliably. The current
  `previous !== controls` notification condition misses metadata-only changes.
- Preserve generation-based stale-detach safety and reset capability metadata
  on current detach/destroy.

### Complete the missing tests

The corrected status says these cases are covered, but the changed test list
does not contain them. Add focused tests for:

1. `ActiveSparkControlsRuntime`:
   - default/explicit `sourceSyncEnabled` values;
   - `canSourceSync()` requires controller identity;
   - same-controller reattach with changed permission notifies/updates;
   - stale detach cannot alter a newer controller or its permission;
   - current detach and destroy clear permission.
2. Initial renderer settings:
   - all 22 effective settings come from one `SparkControls.settings` snapshot;
   - an active-profile scene override is included before first renderer use;
   - `lodSplatCount: null` becomes `undefined`;
   - no literal fallback profile exists in the bridge/helper.
3. Transaction guard:
   - active dynamic controller blocks root `profileSettings`;
   - active file-backed controller allows only exact-root `profileSettings`;
   - stale/non-active controller remains blocked even while the new active
     controller is persistable.
4. Query-string behavior:
   - `?splat_url=` pre-fills;
   - legacy `?url=` is ignored;
   - Start writes `splat_url`, deletes a pre-existing `url`, preserves
     `debug=true` and unrelated parameters, and the value is present after
     reload/navigation as intended.

The existing ad-hoc pane e2e tests already cover the session-only warning and a
live numeric edit. Keep them. Do not add a test that mutates real project source
unless it uses a safely isolated fixture/copy and restores it reliably.

### Optional real `buildTransaction` test import

The current replicated write callback is acceptable. If this direct import
works cleanly under Vitest, it can replace or supplement the replica:

```ts
import { buildTransaction } from '../../node_modules/@threlte/studio/dist/extensions/transactions/TransactionQueue/buildTransaction.js'
```

This bypasses the package `exports` map and is coupled to the pinned Studio
0.4.3 internal layout. Requirements if used:

- Test-only; never import this path from production code.
- Add a comment explaining the version coupling.
- Confirm TypeScript uses the adjacent `.d.ts` and Vitest/Vite resolves the
  internal module's `@threlte/core` import with the `svelte` condition.
- If `check`, lint, or Vitest resolution becomes awkward, retain the accepted
  public-`resolvePropertyPath` replica and document why. Do not add aliases,
  patch dependencies, or modify `node_modules` merely to force this.

## Acceptance criteria

- [ ] No Spark setting fallback literals remain in `SparkStudioBridge` or a new
      conversion helper; global values come only from the two baselines.
- [ ] Both renderers start from the complete effective settings snapshot,
      including active scene overrides and null-to-undefined conversion.
- [ ] Spark source-sync permission is evaluated for the exact transaction
      controller identity.
- [ ] Same-controller metadata re-registration and stale detach are safe and
      tested.
- [ ] Dynamic/session-only edits remain live; file-backed exact-root
      `profileSettings` persistence remains enabled.
- [ ] Tests explicitly cover the runtime capability, initial renderer snapshot,
      stale transaction identity, legacy query rejection/removal, unrelated
      query preservation, and `splat_url` reloadability.
- [ ] README names `splat_url`; AGENTS.md accurately describes the final
      identity-aware source-sync and initialization flow.
- [ ] `npm run check`, `npm run lint`, `npm run test:unit`,
      `npm run test:e2e`, and `npm run build` pass.

Re-check every acceptance item before finalizing.

## Things Pi must not change

- Do not change desktop/mobile baseline values.
- Do not restore `DeviceProfile.sparkRenderer` or introduce another settings
  object containing baseline literals.
- Do not change RAD URLs, camera/keyframes, routing grammar, dual-renderer
  architecture, scene persistence format, or ScrollAnimator source-sync rules.
- Do not disable ad-hoc live Spark editing or file-backed source sync.
- Do not reintroduce legacy `url` query compatibility.
- Do not modify dependencies or files in `node_modules`.
- Do not make the optional internal Studio import a production dependency or a
  blocker.
- Do not perform unrelated cleanup or formatting.

## AGENTS.md update

Update AGENTS.md concisely with source references for:

- required-controller renderer initialization from the effective settings
  snapshot with no fallback literals;
- identity-aware dynamic/file-backed source-sync permission;
- `splat_url` query behavior and legacy `url` removal.

Do not add a full implementation log.

## Expected completion report

Write `.codex-handoff/status.md` containing:

1. Summary and changed files.
2. Exact renderer initialization flow.
3. Exact identity-aware source-sync decision flow.
4. Tests added, with full command results.
5. Acceptance checklist item by item.
6. Whether the optional real `buildTransaction` import was used; if not, why
   the accepted replica remains.
7. Residual risks and final commit hash/branch.

Finish all code, tests, documentation, and acceptance review first. Always
write `status.md` as the last action before the final commit/push. After pushing,
perform no more verification or modification.
