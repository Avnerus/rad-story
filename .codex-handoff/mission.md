# Follow-up mission: prove live mode switching and persisted settings

## Objective

Keep the implemented playback/edit architecture unchanged. Close two verification gaps and one diff-hygiene issue:

1. Prove view/edit transitions clean up correctly during a live SPA route change, not only through full-page `page.goto()` navigation.
2. Prove the complete persisted Spark settings snapshot is applied identically in playback and edit mode; controller registration alone is insufficient.
3. Remove the trailing whitespace introduced in `SceneRuntime.svelte`.

## Required corrections

### Live SPA cross-mode transitions

The current cross-mode tests use `page.goto()` between view and edit URLs. That destroys/reloads the document and cannot detect leaks in App's live `{#if sceneMode === 'edit'}` branch transition.

Add a small test helper that changes history and dispatches `popstate`, matching the production router:

```ts
window.history.pushState({}, '', path)
window.dispatchEvent(new PopStateEvent('popstate'))
```

Test both directions within the same document:

- edit → view
- view → edit
- repeated edit ↔ view cycles

Start edit → view with the editor camera enabled and the custom frustum helper active. After the live transition, assert:

- old Studio UI and hierarchy are removed
- helper and its diagnostic are removed
- editor camera no longer owns the renderer
- the new scene's app camera is active
- old SparkControls is disposed exactly once
- old renderers/meshes are disposed as appropriate
- exactly one current scene runtime, active mesh/wrapper, driving renderer/pager, and ScrollTrigger remain

For view → edit, assert exactly one Studio toolbar/hierarchy/helper diagnostic appears and no old playback runtime resources remain.

Use or extend narrow stub diagnostics for exact identities/counts. Do not infer cleanup merely from DOM disappearance.

### Exact persisted Spark settings evidence

The current playback test treats the presence of an entry in `sparkControlsDisposals` as proof that settings reached the controller. It proves only registration.

Extend the existing stub-only SparkControls registration diagnostic to capture a plain snapshot of the controller's complete `settings` object, keyed by controller ID. Assert:

- playback has one current controller with all 22 settings
- edit has one current controller with all 22 settings
- view and edit snapshots are deeply equal because they come from the same scene source
- representative values also reach the live Spark renderers, including at least `maxPagedSplats`, one ordinary quality field, one LOD field, and one foveation field
- switching modes recreates controller/renderer identities but preserves the complete settings values

Do not duplicate expected settings in App/router code. The diagnostic reads actual scene-created controller/renderers.

### Diff hygiene

Remove the blank line containing trailing whitespace at `src/lib/components/SceneRuntime.svelte:13`. Ensure `git diff --check` is clean.

## Files likely involved

- `tests/e2e/playback-edit.spec.ts`
- `tests/fixtures/spark-stub.ts`
- `src/lib/components/SceneRuntime.svelte`
- possibly existing Spark stub diagnostic types/hooks
- `AGENTS.md` only if diagnostic documentation changes materially

Avoid production architecture changes unless a narrow identity diagnostic is required.

## Constraints

- Preserve `/scene/{sceneName}` as Studio-free playback.
- Preserve `/scene/{sceneName}/edit` as Studio editing.
- Preserve the same registry component in both modes.
- Keep CameraFrustumHelper owned by the Scroll Animator extension.
- Keep diagnostics stub-only and absent in production.
- Preserve Spark reload/pager behavior, stable wrapper, default camera, source sync, and existing deterministic tests.
- Do not add dependencies or change unrelated files.
- Do not touch the user's unrelated `package-lock.json`.

## Acceptance criteria

1. Cross-mode tests transition with `pushState` + `popstate` in the same document.
2. Edit → view with active editor camera/helper leaves no Studio/helper/editor-camera state and exactly one healthy playback runtime.
3. View → edit leaves exactly one Studio/editor runtime and no stale playback resources.
4. Repeated live mode switches do not accumulate renderers, meshes, pagers, controllers, helpers, ScrollTriggers, subscriptions, or overlays.
5. Stub diagnostics expose complete current Spark settings snapshots keyed by controller identity.
6. Playback and edit settings snapshots contain all 22 fields and are deeply identical.
7. Representative persisted settings are asserted on the actual live Spark renderers in both modes.
8. Controller/renderer identities change across mode remount while settings values remain identical.
9. Existing direct navigation, refresh, history, playback camera, and edit-source-sync tests remain green.
10. `git diff --check` reports no whitespace errors.
11. Check reports zero errors/warnings; lint, unit, full e2e, and build pass.
12. `AGENTS.md` remains concise and accurate.

## Tests to run

- focused Playwright tests for the live cross-mode transitions
- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`
- `git diff --check`

Run the complete suite after focused work and report exact totals.

## Things Pi must not change

- Do not replace live SPA tests with `page.goto()` tests.
- Do not use DOM disappearance alone as cleanup evidence.
- Do not treat controller registration as settings evidence.
- Do not hard-code a second settings source for comparison.
- Do not redesign routing, scene files, Studio hosting, or Spark lifecycle.
- Do not modify unrelated user work, lockfiles, dependencies, or generated output.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Live SPA transition mechanism and exact cleanup identities/counts.
2. Complete controller settings diagnostic format.
3. View/edit settings equality and renderer propagation evidence.
4. Repeated-cycle leak evidence.
5. Diff-hygiene result.
6. Changed files and rationale.
7. Acceptance checklist mapped to unconditional assertions.
8. Exact full-suite results and warning counts.
9. `AGENTS.md` update confirmation, if changed.

Always write `status.md` as the final content change before committing and pushing. Re-check all acceptance criteria immediately before writing it. After writing the report, do not run more verification or modify files. Commit all intended changes, push the current branch, and stop.
