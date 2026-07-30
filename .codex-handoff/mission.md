# Mission: Scene-scoped Spark Controls and unobstructed edit route

## Objective

Make the Spark Controls Studio extension operate automatically on the active scene's `SparkControls` instance. Authors must not need to select the `Spark` hierarchy object before opening or using the pane.

Also remove the viewer header from `/scene/{scene_name}/edit`: neither the Home button nor the `Scene: name` indicator should overlay the Studio toolbar. Keep the header unchanged in playback and ad-hoc viewer modes.

This mission follows the completed playback/edit route split. Full-page navigation and direct route loads are intentional; do not introduce SPA transitions between playback and edit modes.

## Files likely involved

- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- A small active-controller runtime/registry near `src/lib/studio/spark-controls/`, if useful
- `src/lib/components/SceneRuntime.svelte`
- `src/App.svelte`
- Relevant unit tests for any new runtime/registry
- `tests/e2e/spark-controls.spec.ts` or the current Spark Controls e2e suite
- `tests/e2e/playback-edit.spec.ts`
- `AGENTS.md`

Use the actual current structure and keep changes scoped; do not scan or refactor unrelated areas.

## Constraints and implementation guidance

### Active scene Spark Controls

- Decouple the Spark Controls pane from `useObjectSelection()`. Hierarchy selection must not determine which controller the pane edits.
- Prefer explicit registration of the mounted scene's `SparkControls` instance through a small reactive runtime/bridge instead of traversing the Three scene and taking the first branded object.
- Registration must have attach/detach lifecycle safety:
  - A destroyed or older scene must not clear a newer scene's active controller.
  - Remounts and route reloads must not leave stale controller or reload-status subscriptions.
  - The no-controller state should be handled safely and clearly.
- The active controller must remain stable while the author selects a camera, ScrollAnimator, SplatWrapper, another hierarchy object, multiple objects, or nothing.
- Keep transactions associated with the actual active `SparkControls` object so Threlte Studio source sync continues to target the correct scene's declarative `settings` attribute.
- Continue subscribing to `activeController.reloadStatus`; unsubscribe when the active controller changes or the extension is destroyed.
- Keep the `Spark` hierarchy object and its source-sync metadata unless there is a proven reason to remove it. The change is that selection is no longer required.
- Preserve all validation, controlled renderer recreation, mesh reload, and transaction-guard invariants.
- The app currently has one active scene per Canvas. Still make registration identity-safe rather than relying on detach ordering.
- Apply the same behavior wherever the existing Spark Controls extension is available, including the ad-hoc editor, unless the current architecture makes that unsafe. Do not regress ad-hoc authoring.

Critical shape only, not a mandated API:

```ts
const detach = activeSparkControlsRuntime.attach(sparkControls)

onDestroy(detach) // detach clears only if this registration is still current
```

The extension should react to the runtime's active controller and build transactions against that object without requiring hierarchy selection.

### Edit-route header

- On `/scene/{scene_name}/edit`, do not render the viewer header at all.
- Remove both the Home button and `Scene: name` indicator from that mode; do not replace them with another overlay.
- Keep the playback route header unchanged.
- Keep the ad-hoc viewer/editor header behavior unchanged.
- The loading overlay and other required non-header UI may remain.
- Ensure direct navigation and refresh on an edit URL also have no header.

### Navigation

- Full page `page.goto`/direct-load behavior between playback and edit is the accepted design.
- Do not add client-side SPA transitions or a playback/edit toggle for this mission.

## Acceptance criteria

1. Opening the Spark Controls pane in a scene editor immediately shows and edits the active scene's settings without selecting `Spark`.
2. Selecting any other hierarchy object, selecting multiple objects, or clearing selection does not disable, retarget, or reset the Spark Controls pane.
3. Spark edits still persist to the correct scene Svelte source and retain all current validation behavior.
4. Reload progress and errors continue to reflect the active controller, including when hierarchy selection changes during a reload.
5. Scene/editor remounts do not retain stale controllers or subscriptions, and an older detach cannot clear a newer registration.
6. `/scene/baby_yoda/edit` renders no viewer header, Home button, or `Scene: baby_yoda` indicator.
7. The Studio toolbar is unobstructed at the top of the edit route.
8. `/scene/baby_yoda` retains its playback header and behavior.
9. The ad-hoc viewer/editor retains its existing header and Spark authoring behavior.
10. Existing playback/edit route behavior remains full-page/direct-load based; no SPA transition requirement is introduced.
11. Existing ScrollAnimator, camera-frustum-helper, renderer, reload, source-sync, and scene persistence behavior remains intact.
12. `AGENTS.md` is updated with concise current architecture and source references for automatic active-scene Spark Controls and edit-route header visibility.

Before finalizing, re-check every acceptance criterion explicitly.

## Tests to add or update

- Add unit tests for the active-controller runtime/registry if one is introduced:
  - attach publishes the controller;
  - current detach clears it;
  - stale detach cannot clear a newer controller;
  - subscriber cleanup/remount behavior;
  - safe no-controller state.
- Update Spark Controls e2e coverage to open and use the pane without first selecting `Spark`.
- Verify numeric, boolean, nullable, cone-angle, and capacity edits still target the active controller and preserve source-sync behavior.
- Verify selecting a non-Spark object, multiple objects, and no object leaves the pane bound to the same active controller.
- Preserve or extend the mid-reload selection-change test so progress/error state remains correct without Spark selection.
- Add route tests proving:
  - `/scene/baby_yoda/edit` has no viewer header, Home button, or scene-name indicator;
  - the Studio toolbar has no header overlap using actual bounding rectangles where practical;
  - `/scene/baby_yoda` still has its playback header;
  - ad-hoc mode retains its existing header.
- Add remount/direct-refresh coverage sufficient to detect a stale active controller.
- Run:
  - `npm run check`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run build`
  - `git diff --check`

Create new tests for the new behavior; do not rely only on modifying old assertions.

## Things Pi must not change

- Do not implement SPA transitions between playback and edit.
- Do not change the `/scene/{scene_name}` and `/scene/{scene_name}/edit` route contract.
- Do not add or refer to a `/scenes` route.
- Do not revisit the transform gizmo appearance. The reported wireframe/white appearance was Studio's Wireframe render mode and is resolved by returning to Rendered mode.
- Do not remove the playback or ad-hoc header.
- Do not move persisted scene settings into browser storage, a central manifest, or runtime-only state.
- Do not move the hard-coded splat URL out of the scene Svelte file.
- Do not weaken transaction guards or permit Spark transforms/nested settings paths to source-sync.
- Do not alter Spark defaults, validation bounds, renderer propagation, reload coordination, pager handoff, or race-safety behavior except where strictly necessary for this feature.
- Do not refactor unrelated scene, Studio, Spark, or routing code.
- Do not modify unrelated user work, including `package-lock.json`.

## Documentation

Update `AGENTS.md` with concise, up-to-date information that a fresh agent needs:

- where the active Spark controller registration/runtime lives;
- how `SceneRuntime` attaches and detaches it;
- how `SparkControlsExtension` edits it independently of hierarchy selection;
- the lifecycle/stale-detach invariant;
- edit-route versus playback/ad-hoc header behavior;
- relevant source and test file references.

Do not turn `AGENTS.md` into a chronological implementation log.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary of the implementation.
2. Files changed and why.
3. Active-controller lifecycle and transaction-targeting explanation.
4. Header visibility behavior by route/mode.
5. Tests added or updated.
6. Exact commands run and results.
7. Explicit acceptance-criteria checklist.
8. Any limitations, risks, or manual checks still needed.
9. Final commit hash pushed to the current branch.

Always write `status.md` as the last action before committing/pushing. After writing it, perform no more verification or modification. Push the completed implementation and report to the current branch.
