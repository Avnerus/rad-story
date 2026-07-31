# Mission: opt-in stats.js FPS widget for scene routes

## Objective

Add an opt-in FPS display for file-backed scenes. When either `/scene/{name}?debug=true` (playback) or `/scene/{name}/edit?debug=true` (Studio editor) runs, show the stats.js FPS widget fixed at the top of the viewport. Ordinary scene URLs must remain unchanged and show no widget.

This feature is scoped to file-backed scene routes in both modes. Do not enable it on the landing page, not-found page, or ad-hoc `?url=...` viewer unless an existing project convention makes that necessary and the completion report explains why.

## Files likely involved

- `src/App.svelte` — derive the debug flag from `window.location.search`, keep it correct during route/popstate changes, and conditionally mount the widget only for a resolved scene.
- A small new component under `src/lib/components/` (for example `StatsWidget.svelte`) — own the stats.js instance, animation-frame updates, DOM placement, and teardown.
- `package.json` and `package-lock.json` — add `stats.js` and TypeScript declarations if the package requires separate types.
- `tests/e2e/playback-edit.spec.ts` or another narrowly relevant scene-route spec — verify both playback and edit behavior.
- Unit tests for any extracted pure query parser/helper, if one is introduced.
- `AGENTS.md` — concise current documentation of the debug query option and source references.

Note: `package-lock.json` was already modified before this mission was created. Preserve legitimate existing work and integrate the dependency change carefully; do not discard unrelated lockfile edits.

## Constraints

- Treat the flag as opt-in: enable only when the query parameter's value is exactly `true` (`?debug=true`). `?debug=false`, a missing/empty value, and unrelated query parameters must not enable it.
- Query parsing must not alter the existing pathname route grammar or scene registry behavior. Preserve other query parameters.
- The widget must work in both scene playback and scene edit mode, including direct page loads.
- The widget must be fixed at the top of the viewport and remain visible above the WebGL canvas and Studio overlays. Use an intentional z-index and avoid changing surrounding layout or scroll measurements.
- Show the FPS panel by default. It is acceptable for the standard stats.js panel-click behavior to remain available.
- Integrate with Svelte lifecycle correctly: instantiate only in the browser, run one update loop per mounted widget, cancel its animation frame, and remove its DOM node on unmount. Route transitions/remounts must not leak or duplicate widgets.
- Ensure debug state is recomputed when the app handles history navigation (`popstate`), rather than being a one-time immutable read if that would leave stale UI.
- Prefer a small isolated component over embedding imperative widget lifecycle code throughout `App.svelte`.
- Keep the implementation typed; do not add broad `any`, `@ts-ignore`, or private framework imports.
- Do not use the existing hidden camera/debug diagnostics as the visual FPS widget; use the `stats.js` package requested.
- Preserve all current scene rendering, loading, editor/playback separation, headers, URL-prefill behavior, and scroll animation behavior.
- Avoid unrelated refactors or formatting churn.

Critical lifecycle shape, if useful (adapt to Svelte 5/project conventions rather than copying blindly):

```ts
onMount(() => {
  const stats = new Stats()
  stats.showPanel(0) // FPS
  // Attach/mark/style stats.dom, then update it from requestAnimationFrame.
  return () => {
    cancelAnimationFrame(frameId)
    stats.dom.remove()
  }
})
```

## Acceptance criteria

- Visiting `/scene/baby_yoda?debug=true` displays exactly one stats.js FPS widget fixed at the top of the viewport.
- Visiting `/scene/baby_yoda/edit?debug=true` displays exactly one stats.js FPS widget fixed at the top of the viewport and above the Studio UI/canvas.
- The widget is visibly the FPS panel on initial display.
- `/scene/baby_yoda`, `/scene/baby_yoda/edit`, `?debug=false`, `?debug=`, and unrelated query strings do not display the widget.
- Landing, not-found, and ad-hoc viewer flows do not gain the widget from this scene-only feature.
- History/route transitions do not leave a stale widget or create duplicates; query-derived state reflects the current browser URL when routing is re-evaluated.
- Mount/unmount cleanup cancels the widget's RAF loop and removes its DOM element.
- Existing behavior and tests continue to pass.
- New automated tests cover positive behavior in both playback and edit modes and representative negative behavior. Tests should use a stable app-owned selector/test identifier rather than depending solely on undocumented stats.js DOM internals.
- `AGENTS.md` concisely documents `?debug=true`, its scope, and the main implementation/test source references.
- Re-check every acceptance criterion immediately before finalizing.

## Tests to run

- Add focused Playwright coverage for playback and edit scene URLs with `?debug=true`.
- Add focused negative coverage for no flag and at least `?debug=false`; cover route transition/duplicate cleanup if practical.
- Add a unit test if query interpretation is extracted into a pure helper.
- `npm run check`
- `npm run lint`
- `npm run test:unit`
- Run the directly relevant Playwright spec(s), then `npm run test:e2e` if feasible.
- `npm run build`

Create new tests for the feature; do not rely only on manual inspection. Report exact commands and outcomes, including any failures that pre-date the change.

## Things Pi must not change

- Do not change scene route syntax, registry discovery, or playback-versus-edit hosting.
- Do not enable Studio in playback mode or alter editor extension behavior.
- Do not alter camera, ScrollTrigger, Spark renderer/reload, or SplatMesh lifecycle code.
- Do not change the meaning of the existing `url` query parameter.
- Do not expose or repurpose test-only Spark/camera diagnostics in production.
- Do not discard unrelated user changes, especially the pre-existing `package-lock.json` modification.
- Do not add a custom FPS implementation in place of stats.js.
- Do not commit generated build output or unrelated dependency upgrades.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary of the implemented user-visible behavior.
2. Changed files and the purpose of each.
3. Exact debug-query semantics and widget lifecycle/cleanup design.
4. Tests added or changed.
5. Exact verification commands and pass/fail results.
6. Acceptance-criteria checklist, item by item.
7. Any known limitations, assumptions, or unrelated pre-existing working-tree changes preserved.
8. Commit hash pushed to the current branch.

Update `AGENTS.md` with concise, up-to-date feature information and source references; it does not need a full implementation log.

Always write `status.md` as the final action before pushing. After writing the report and pushing the implementation, do not perform any further verification or modification. Re-check that every acceptance-criteria item is met before finalizing the mission, then push all intended implementation, tests, documentation, and the final report to the current branch.
