# Status: opt-in stats.js FPS widget for scene routes

## 1. Summary of implemented user-visible behavior

An opt-in FPS display is now available for file-backed scene routes. Appending `?debug=true` to any `/scene/{name}` (playback) or `/scene/{name}/edit` (Studio editor) URL shows the stats.js FPS widget fixed at the top-left of the viewport. The widget is **only** enabled for the exact value `?debug=true` — `?debug=false`, `?debug=`, `?debug=yes`, and missing `debug` all leave the widget hidden. The widget does not appear on landing, not-found, or ad-hoc viewer flows.

## 2. Changed files and purpose

| File | Purpose |
|------|---------|
| `src/lib/components/StatsWidget.svelte` | New isolated component: instantiates stats.js, appends DOM to `document.body`, runs RAF loop, cleans up on unmount. |
| `src/lib/types/stats.d.ts` | TypeScript declarations for `stats.js` (no bundled types in the package). |
| `src/App.svelte` | Derives `debugMode` from `window.location.search` on every route change; conditionally mounts `<StatsWidget />` for scene routes only. |
| `src/app.css` | `.stats-widget` CSS class: `position: fixed`, top-left, `z-index: 99999`. |
| `package.json` | Added `stats.js` dependency. |
| `package-lock.json` | Lockfile updated for `stats.js@0.17.0`. |
| `AGENTS.md` | Added "Debug FPS Widget" section documenting feature, semantics, and source references. |
| `tests/e2e/debug-fps-widget.spec.ts` | 15 e2e tests: positive (playback + edit), negative (7 cases), route transitions (4 cases). |

## 3. Debug-query semantics and widget lifecycle/cleanup design

- **Query parsing:** `new URLSearchParams(window.location.search).get('debug') === 'true'` in `handleRouteChange()`. Recomputed on every `popstate` and initial load. Does not alter pathname route grammar or scene registry.
- **Mount:** `StatsWidget.svelte` creates `new Stats()`, calls `showPanel(0)` for FPS, appends `stats.dom` to `document.body` with `data-testid="stats-widget"` and class `stats-widget`.
- **RAF loop:** Single `requestAnimationFrame` tick loop calling `stats.begin()` then `stats.end()` each frame.
- **Unmount:** `cancelAnimationFrame(frameId)` + `stats.dom.remove()`. Svelte's `onDestroy` guarantees cleanup on route transitions and remounts.
- **No duplicates:** The widget is a child of `App.svelte`'s scene branch; navigating away unmounts it. Re-navigating creates a fresh instance.

## 4. Tests added

**`tests/e2e/debug-fps-widget.spec.ts`** — 15 Playwright tests in 3 describe blocks:

- **Debug FPS widget — playback mode** (4 tests): widget visible at `?debug=true` in both playback and edit, fixed at top-left, remains visible after scrolling
- **Debug FPS widget — negative cases** (7 tests): no widget without query, `?debug=false`, `?debug=`, `?debug=yes`, no widget on landing/not-found even with `?debug=true`
- **Debug FPS widget — route transitions** (4 tests): navigating away removes widget, navigating from debug to non-debug removes widget, no duplicates after repeated remounts, survives direct page reload

## 5. Exact verification commands and results

```
$ npm run check
svelte-check found 0 errors and 0 warnings

$ npm run lint
(no output — clean)

$ npm run test:unit
Test Files  20 passed (20)
Tests  333 passed (333)

$ npm run test:e2e
137 passed (26.5s)

$ npm run build
✓ built in 4.80s
```

## 6. Acceptance-criteria checklist

- ✅ `/scene/baby_yoda?debug=true` displays exactly one stats.js FPS widget fixed at top of viewport
- ✅ `/scene/baby_yoda/edit?debug=true` displays exactly one stats.js FPS widget above Studio UI/canvas
- ✅ Widget shows FPS panel by default (`showPanel(0)`)
- ✅ `/scene/baby_yoda`, `/scene/baby_yoda/edit`, `?debug=false`, `?debug=`, and unrelated query strings do not display the widget
- ✅ Landing, not-found, and ad-hoc viewer flows do not gain the widget
- ✅ History/route transitions do not leave stale widget or create duplicates; query-derived state reflects current URL
- ✅ Mount/unmount cleanup cancels RAF loop and removes DOM element
- ✅ Existing behavior and tests continue to pass (all 333 unit + 137 e2e pass)
- ✅ New automated tests cover positive behavior in both playback and edit modes and representative negative behavior, using `data-testid="stats-widget"` selector
- ✅ `AGENTS.md` documents `?debug=true`, scope, and source references
- ✅ All acceptance criteria re-checked before finalizing

## 7. Known limitations and assumptions

- The widget uses stats.js's default panel-click cycling behavior (FPS → MS → MB if memory API available). This is standard stats.js behavior.
- The widget is scoped to file-backed scene routes only, as specified. Extending to ad-hoc viewer would require a small change to the `appState` condition in `App.svelte`.
- No pre-existing working-tree changes were affected; the only lockfile change is the `stats.js` addition.

## 8. Commit hash

`a4d3895` — pushed to `main` branch.
