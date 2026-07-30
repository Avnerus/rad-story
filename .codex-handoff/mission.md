# Mission: File-backed scenes and camera-rig frustum helper

## Objective

Add first-class, file-backed scenes to RAD Story. A scene is selected by URL and corresponds to an actual Svelte source file under `src/lib/scenes/`. Each scene must own its hard-coded RAD URL and its Studio-authorable declarations so that model transforms, camera/target scroll keyframes, and Spark settings can be edited and source-synced independently into that scene file.

The requested example and route are:

- Scene file: `src/lib/scenes/baby_yoda.svelte` (use the repository's filename casing convention consistently)
- URL: `/scene/baby_yoda`
- RAD URL: `https://avner.us/baby_yoda-lod.rad`

Support only the singular route namespace `/scene/{sceneName}`. Do not add `/scenes/{sceneName}` as an alias. The URL route is singular even though the source directory remains plural: `src/lib/scenes/`.

Also add a declarative way for a camera-bearing `ScrollAnimator` in a scene file to request camera-frustum visualization. When that animator is selected in Studio, the helper for its descendant `PerspectiveCamera` must be displayed just as it is when the camera itself is selected. The scene declaration should make this opt-in obvious and source-local.

## Architectural direction

Refactor `RadStoryScene.svelte` into a reusable scene runtime/host plus lean, declarative scene files.

The runtime/host should own shared behavior only:

- ScrollTrigger creation, attachment, traversal-based animator playback, and cleanup
- per-frame camera look-at behavior and active-camera/debug state
- Spark renderer bridge and reload lifecycle
- common loading/ready wiring
- shared Studio integration that cannot live declaratively in a scene

Each file under `src/lib/scenes/` should own only scene-specific declarations/data:

- the hard-coded RAD URL
- literal scene objects exposed to Studio, especially the camera `ScrollAnimator`, target `ScrollAnimator`, `PerspectiveCamera`, `CameraTarget`, `SparkControls`, and splat wrapper/model declaration as appropriate
- keyframe arrays, settings, names, and scene-specific transforms
- the declarative opt-in for selecting the camera animator to show the descendant camera frustum

The scene file must remain lean: do not copy renderer setup, ScrollTrigger lifecycle, reload coordination, camera tasks, or other orchestration into every scene. Avoid maintaining the same keyframes/settings twice (for example once in constructor assignments and once in markup). There must be one source-syncable declarative value for each authored property.

Preserve Threlte Studio source sync. In particular, do not hide authorable objects behind a reusable abstraction if doing so causes Studio transactions to update a shared component rather than the selected scene file. Prefer literal `<T>` nodes in each scene file for values Studio must rewrite. Validate this behavior rather than assuming that a config object or wrapper component remains source-syncable.

Use a small explicit scene contract between the scene file and runtime. A Svelte 5 snippet/context/composition design is acceptable if it keeps the authorable `<T>` declarations literal in the scene source. Keep object ownership and cleanup clear. Do not create global singleton scene objects that leak state across navigation or HMR.

For scene discovery/routing, use a statically analyzable registry derived from actual Svelte scene modules (for example a narrowly scoped `import.meta.glob`), or an equally small typed registry if Studio/Vite source transformation requires it. Requirements:

- only valid files below `src/lib/scenes/` can become scenes
- scene names are normalized and validated; path traversal or arbitrary imports are impossible
- direct navigation and browser refresh at `/scene/baby_yoda` load the scene
- unknown scene names render a clear not-found state and a way back
- history/back/forward behavior remains correct
- the existing landing URL workflow should remain functional unless a clean, tested product decision makes scene routes the replacement; do not silently regress it
- entering a scene route must not write the hard-coded RAD URL into the query string

Do not introduce SvelteKit solely for this feature. The current app is a client-side Vite/Svelte app; implement the smallest robust pathname router unless repository constraints prove otherwise.

## Camera-frustum helper direction

First inspect how the installed Threlte Studio version currently detects selection and displays the helper for a selected `PerspectiveCamera`. Reuse public APIs where possible and do not import private Studio internals.

Add a declarative, typed opt-in located in the camera animator declaration. A property on `ScrollAnimator` (with a clear name such as `showChildCameraFrustumWhenSelected`) is one possible design; a tiny declarative child/marker is also acceptable if it produces cleaner ownership and source sync. Choose the smallest public-API-compatible design and document the final contract.

Behavior:

- selecting the opted-in camera `ScrollAnimator` shows the helper for its intended descendant `PerspectiveCamera`
- selecting the `PerspectiveCamera` itself continues to show the helper
- selecting unrelated objects does not show that camera's helper
- deselection, scene changes, Studio editor-camera toggles, HMR, and component destruction clean up correctly
- no duplicate helpers, stale helpers, or leaked subscriptions/Three objects
- the helper tracks the animated camera's current world transform and projection changes
- the helper is editor visualization only and does not affect the rendered scene or production camera ownership
- do not assume the first arbitrary descendant camera is correct if the declarative contract can identify it explicitly

If the built-in Studio helper cannot be extended through public APIs, implement a small owned `CameraHelper` integration with equivalent selection behavior. Keep it out of normal rendering where appropriate and dispose/remove it safely.

## Files likely involved

- `src/App.svelte`
- `src/lib/components/RadStoryScene.svelte` (likely split/renamed into a runtime host)
- new runtime/context components or typed scene contract under `src/lib/components/` or `src/lib/scenes/`
- new `src/lib/scenes/baby_yoda.svelte`
- `src/lib/spark/ScrollAnimator.ts` if the opt-in is a typed property
- Studio selection/helper integration under `src/lib/studio/`
- transaction guards only if a new declarative authoring property requires deliberate persistence rules
- `tests/unit/` for routing/registry/contract and helper lifecycle logic
- `tests/e2e/` for direct scene routing, source-facing scene identity, Studio edits, scroll playback, Spark controls, and helper selection behavior
- `AGENTS.md`

Keep the scope narrow and adjust the exact file list after inspecting only the relevant code.

## Constraints

- Maintain Svelte 5, TypeScript, Threlte, and current Studio public APIs.
- Preserve the existing single boolean `scrub: true` ScrollTrigger and scene-wide branded `ScrollAnimator` traversal behavior.
- Preserve the real-camera/editor-camera ownership round trip and camera-target look-at invariant.
- Preserve the dual Spark renderer, stable `SplatWrapper`, race-safe reload, pager handoff, and reload-status behavior.
- Preserve device-profile defaults and per-scene editable Spark settings. A scene may seed its `SparkControls` from a device profile, but Studio persistence must result in stable scene-local declarative values without duplicate initialization.
- Model/SplatWrapper transforms authored in one scene must not affect another scene.
- Keyframes and Spark settings authored in one scene must persist to that scene's Svelte file and must not update a shared runtime file or another scene.
- Scene switching/remounting must clean up ScrollTrigger, runtime attachment, renderer/mesh resources, helpers, stores/subscriptions, and debug bindings.
- Use no private `@threlte/studio` imports.
- Avoid unrelated dependency upgrades or formatting churn.
- Preserve the user's existing unrelated `package-lock.json` modification unless the feature genuinely requires a dependency change; never overwrite it casually.
- Do not add redundant imperative assignments that mirror authored markup.
- Do not weaken transaction guards or allow transform source sync onto `ScrollAnimator`/`SparkControls` unintentionally.
- Keep accessibility and clear loading/error/not-found feedback.

## Critical implementation suggestion

Aim for composition resembling the following responsibility split, but adapt syntax to what Svelte 5 and Studio source sync actually support:

```svelte
<!-- src/lib/scenes/baby_yoda.svelte: illustrative, not prescribed API -->
<SceneRuntime radUrl={BABY_YODA_URL} ...>
  <T
    is={cameraAnimator}
    name="Camera ScrollAnimator"
    keyframes={[...]}
    showChildCameraFrustumWhenSelected
  >
    <T is={camera} name="PerspectiveCamera" makeDefault />
  </T>

  <T is={targetAnimator} name="Camera Target ScrollAnimator" keyframes={[...]} />
  <T is={sparkControls} name="Spark" settings={{ ... }} />
  <SceneSplats ... />
</SceneRuntime>
```

The important point is not this exact API. The important points are that shared runtime code occurs once, each scene's authored values occur once, and Studio rewrites the selected scene file.

## Acceptance criteria

1. Directly opening or refreshing `/scene/baby_yoda` loads the Baby Yoda RAD scene and its scrollable viewer without first using the landing form.
2. The route maps to a real Svelte file in `src/lib/scenes/`; an unknown or invalid scene name produces a tested not-found state without attempting arbitrary imports.
3. The Baby Yoda scene hard-codes `https://avner.us/baby_yoda-lod.rad` in its Svelte source, not in routing logic, query parameters, or a global shared default.
4. The scene Svelte file is lean and declarative. Shared rendering, scrolling, look-at, reload, and lifecycle logic exists in reusable runtime code and is not repeated there.
5. Studio can edit and persist the Baby Yoda model/SplatWrapper transform, camera and target scroll keyframes, and all Spark controls into the Baby Yoda scene source. Source sync targets the scene file, not a shared runtime file.
6. Scene-authored keyframes/settings/transforms have a single source of truth; no constructor/markup duplication can overwrite Studio edits on remount.
7. Existing landing-page URL viewing still works, or any intentional replacement is explicitly documented and fully tested. Existing query-string reload behavior for ad-hoc URL viewing is not accidentally broken.
8. Browser back/forward navigation, route entry, scene remount, loading completion, and cleanup work without duplicate ScrollTriggers, renderers, meshes, subscriptions, or helpers.
9. The Baby Yoda scene preserves scroll animation, camera-target look-at, Studio editor-camera toggle behavior, Spark Controls editing, capacity reload behavior, and the stable splat wrapper.
10. A clear declarative opt-in exists on/in the camera scroll animator declaration for the frustum behavior.
11. Selecting the opted-in camera scroll animator displays a correctly updating helper for its intended `PerspectiveCamera`. Selecting the camera directly still works; selecting unrelated objects or leaving the scene hides and cleans up the helper.
12. The helper implementation uses public APIs, does not alter camera ownership/render output, produces no duplicates, and is lifecycle-safe.
13. New unit and e2e tests cover the new routing/registry behavior, per-scene isolation/source-sync target where automation permits, Baby Yoda direct load and scrolling, and camera-helper selection/lifecycle.
14. Existing tests remain green.
15. `AGENTS.md` is updated with concise current architecture, scene authoring instructions, route/registry rules, the Baby Yoda example, the declarative frustum-helper contract, and relevant source references. Do not turn it into a chronological implementation log.

Before finalizing, re-check every acceptance-criteria item explicitly and resolve or clearly report any unmet item.

## Tests to run

Create focused new tests, then run at minimum:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Add unit coverage for pure route parsing/name validation/scene registry behavior and any extracted camera-helper selection/lifecycle logic. Add e2e coverage for:

- direct visit and refresh of `/scene/baby_yoda`
- rejection/not-found behavior for the unsupported plural path `/scenes/baby_yoda`
- invalid and unknown scene paths
- Baby Yoda hard-coded URL being used with no `?url=` mutation
- scroll 0% and 100% camera/target behavior in the scene
- browser history/back-forward if navigation UI is added
- camera selection vs opted-in animator selection vs unrelated selection, including helper visibility and cleanup
- scene remount/repeated navigation without duplicate runtime resources
- representative Studio edits for keyframes, Spark settings, and splat wrapper transform, with evidence that the scene-owned declarations are the source-sync targets

Use the Spark stub for deterministic e2e tests as the existing suite does. If a source-file rewrite cannot safely run inside e2e, test transaction metadata/source target deterministically and include a concise manual Studio source-sync verification. Manually verify the real Baby Yoda URL when practical, but do not substitute manual checking for deterministic automated coverage.

## Things Pi must not change

- Do not replace or redesign the Spark renderer/reload architecture.
- Do not change ScrollAnimator interpolation/canonicalization semantics.
- Do not replace boolean ScrollTrigger scrubbing with numeric scrub or per-frame transform reapplication.
- Do not remove the landing/ad-hoc URL experience without an explicit, justified product decision in the report.
- Do not make scene routing capable of importing arbitrary filesystem paths.
- Do not move scene-specific editable values into a central shared config if that prevents Studio from persisting to the individual Svelte scene file.
- Do not use private Studio modules or patch `node_modules`.
- Do not broadly relax source-sync transaction guards.
- Do not commit generated build artifacts, Playwright reports, screenshots, or unrelated lockfile churn.
- Do not modify unrelated user work.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary of the implemented architecture and why Studio source sync targets each scene file.
2. Route syntax and scene discovery/validation behavior, confirming that only singular `/scene/{sceneName}` URLs are supported while files remain under plural `src/lib/scenes/`.
3. Exact files added/changed and their responsibilities.
4. Baby Yoda scene details and its declared RAD URL.
5. Declarative camera-frustum-helper API and lifecycle behavior.
6. Tests added and exact commands/results.
7. Manual verification performed, if any.
8. Acceptance-criteria checklist, item by item.
9. Known limitations, follow-ups, or deviations.
10. Confirmation that `AGENTS.md` was updated concisely.

Always write `status.md` as the last action before committing and pushing. After writing it, do not perform any more verification or modification. Commit all intended changes, including the report, to the current branch and push them. Do not run tests or edit files after the final push.
