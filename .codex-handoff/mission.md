# Mission: separate scene playback and editing routes

## Objective

Split file-backed scene URLs into two modes:

- `/scene/{sceneName}` — playback/viewing mode. Render the scene without Threlte Studio or editor UI. Use the scene's real default camera and every value persisted in its Svelte source: camera/target keyframes, SplatWrapper transform, Spark settings, RAD URL, and other declarative scene attributes.
- `/scene/{sceneName}/edit` — editing mode. Render the same scene with the full Studio experience that `/scene/{sceneName}` currently provides, including hierarchy, Inspector/editor camera, Scroll Animator extension, Spark Controls extension, source sync, and camera-frustum authoring helper.

Use `/scene/baby_yoda` and `/scene/baby_yoda/edit` as the concrete acceptance examples.

The two routes must render the exact same scene Svelte component from `src/lib/scenes/`; do not create separate viewer/editor scene files or duplicate scene values.

## Architectural direction

### Route model

Extend the scene route match with an explicit mode, preferably:

```ts
interface SceneRouteMatch {
  kind: 'scene'
  mode: 'view' | 'edit'
  scene: SceneEntry
}
```

Parse only these exact shapes:

- `/scene/{validName}` → `mode: 'view'`
- `/scene/{validName}/edit` → `mode: 'edit'`

Unknown names, invalid names, empty names, extra segments, and malformed edit suffixes must go to the existing not-found state. Preserve `/` and the current landing/ad-hoc URL workflow.

Keep navigation helpers typed and explicit. `navigateToScene(name)` should navigate to playback by default; add an explicit edit-mode option or helper rather than building route strings throughout the UI.

### One scene, two hosts

For playback mode, the dynamic scene component must be a direct child of `<Canvas>` without a `<Studio>` ancestor.

For editing mode, wrap that same component instance/type with:

```svelte
<Studio extensions={[ScrollAnimatorExtension, SparkControlsExtension]}>
  <SceneComponent ... />
</Studio>
```

Avoid duplicating the `<Canvas>`, renderer configuration, loading overlay, header, scroll spacer, or scene props if a small conditional around `<Studio>` is sufficient. A small shared host component is acceptable only if it preserves the literal scene-file `<T>` source metadata required by Studio.

Do not merely hide Studio with CSS in playback mode. Studio and its editor camera/extensions must not mount there.

### Editor-only helper lifecycle

`CameraFrustumHelper.svelte` currently lives in `SceneRuntime.svelte` and calls Studio's `useObjectSelection()`. Playback mode will not provide Studio context, so this integration must not instantiate outside editing mode.

Prefer moving the frustum-helper component into `ScrollAnimatorExtension.svelte` (or the registered editor-extension layer). This keeps `SceneRuntime` editor-agnostic and automatically mounts the helper only when Studio and the Scroll Animator extension are active. Preserve all existing exact-one-camera, scene-root parenting, disposal, and stub-diagnostic behavior.

Do not add editor-mode props and lifecycle boilerplate to every scene file unless a cleaner extension-owned solution is impossible.

### Persisted playback state

Playback must instantiate the same literal declarations from the scene file, so it automatically receives:

- the hard-coded RAD URL
- the default `PerspectiveCamera` with `makeDefault`
- camera and target ScrollAnimator keyframes
- SplatWrapper position/rotation/scale
- SparkControls settings, including capacity, LOD, foveation, and quality fields
- any future source-synced declarative scene properties

The renderer bridge, Spark controls object, SplatMesh reload coordination, scrolling, camera-target look-at, and stable wrapper remain runtime features in both modes. Only authoring/editor facilities are removed from playback.

In playback mode, confirm the app camera remains the active Threlte camera (`data-active="true"`). No editor camera may be created or take ownership.

## Files likely involved

- `src/lib/router.ts`
- `src/App.svelte`
- `src/lib/components/SceneRuntime.svelte`
- `src/lib/studio/scroll-animator/ScrollAnimatorExtension.svelte`
- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte`
- focused router unit tests
- scene routing/editor/playback e2e tests
- `AGENTS.md`

Avoid modifying scene files unless a genuine scene contract change is necessary.

## Constraints

- Preserve the singular `/scene/` namespace.
- Preserve scene discovery from actual Svelte files under `src/lib/scenes/`.
- Preserve one source of truth per scene; view and edit routes must load the same component.
- Preserve the lean `baby_yoda.svelte` declaration and its source-sync metadata.
- Preserve boolean `scrub: true`, camera-target look-at, stable SplatWrapper, Spark reload/pager handoff, device profile, and renderer settings propagation.
- Preserve source syncing and all Studio functionality in edit mode.
- Do not mount Studio, its extensions, editor camera, hierarchy, Inspector, toolbar, or helper diagnostics in playback mode.
- Do not use private Studio APIs.
- Preserve browser refresh and history/back/forward behavior for both route modes.
- Do not change the existing ad-hoc landing viewer's editor behavior unless required and explicitly justified; this mission concerns file-backed scene routes.
- Do not touch the user's unrelated `package-lock.json` modification.
- Do not introduce unrelated dependencies, formatting churn, or generated artifacts.

## Acceptance criteria

1. `/scene/baby_yoda` directly loads and refreshes the Baby Yoda scene in playback mode.
2. Playback mode contains no `<Studio>` instance and no Studio toolbar, hierarchy, Inspector, editor-camera control, Scroll Animator pane, Spark Controls pane, transform controls, or custom frustum-helper integration.
3. Playback uses the real nested `PerspectiveCamera` as the active default camera for its entire lifecycle; `data-active` is `"true"`.
4. Playback scroll animation, camera-target look-at, RAD rendering, stable wrapper, loading state, and Spark renderer lifecycle work normally.
5. Playback applies the exact declarative Baby Yoda wrapper transform, camera/target keyframes, and Spark settings persisted in `baby_yoda.svelte`.
6. `/scene/baby_yoda/edit` directly loads and refreshes the same Baby Yoda component inside Studio.
7. Edit mode preserves hierarchy selection, Inspector/editor camera, Scroll Animator editing, Spark Controls editing, source sync, and the opted-in camera-frustum helper.
8. Studio edits continue to target `src/lib/scenes/baby_yoda.svelte`; navigating/reloading playback then uses those persisted values without separate configuration.
9. View and edit routes resolve to the same registry `SceneEntry.component`, differing only by route mode/host.
10. Switching between view and edit via history/navigation fully disposes the previous Canvas/runtime/editor resources. No duplicate ScrollTriggers, renderers, meshes, controllers, helpers, Studio overlays, or subscriptions remain.
11. Unknown scene names and malformed paths in either route shape render the not-found state safely.
12. Landing and ad-hoc URL viewing remain functional with their existing behavior.
13. No new Svelte/TypeScript warnings or errors are introduced.
14. `AGENTS.md` documents the playback/edit route distinction, shared scene component invariant, and editor-only helper ownership concisely.

Re-check every criterion against real assertions before finalizing.

## Tests to create or update

### Router unit tests

Cover:

- `/scene/baby_yoda` → scene/view
- `/scene/baby_yoda/edit` → same scene/edit
- view/edit matches share the same component identity
- unknown view and edit scene names
- empty name
- `/scene/baby_yoda/unknown`
- extra trailing segments
- invalid names and traversal attempts
- existing landing behavior
- typed navigation helper output/behavior where practical

### Playback e2e

For `/scene/baby_yoda` assert:

- Canvas and scene load on direct navigation and refresh
- Studio-specific controls/elements are absent, not merely hidden
- no custom `__camera_frustum_helper_diagnostic` is installed
- app camera `data-active` remains true
- scroll 0%/100% camera and target state match persisted keyframes
- SplatWrapper transform matches the literal scene values
- representative persisted Spark settings reach the controller/renderers; use existing stub diagnostics or a narrow stub-only diagnostic
- repeated mount/unmount does not stack runtime resources

### Edit-mode e2e

For `/scene/baby_yoda/edit` assert:

- Studio toolbar/hierarchy and both custom extension buttons appear
- camera animator, camera target animator, Spark, and SplatWrapper are selectable
- editor camera ownership toggles correctly
- Scroll Animator and Spark Controls panes still edit their intended objects
- custom frustum helper still appears only for the opted-in animator
- wrapper/keyframe/settings Studio metadata still targets `baby_yoda.svelte`

### Cross-mode e2e

Assert:

- view and edit use the same scene component/source identity
- navigation edit → view removes all editor UI/helper/editor camera and restores the app default camera
- navigation view → edit mounts exactly one Studio/editor runtime
- back/forward and refresh preserve the route mode
- persisted literal values are identical in both modes

Run final full commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

All must pass with zero new warnings.

## Things Pi must not change

- Do not create separate playback and editor copies of `baby_yoda.svelte`.
- Do not duplicate keyframes, Spark settings, transforms, or RAD URLs in routing/App code.
- Do not mount Studio and hide it with CSS in playback mode.
- Do not allow the custom frustum helper to call Studio hooks without Studio context.
- Do not remove Studio/source-sync behavior from `/edit`.
- Do not change Spark/ScrollAnimator semantics or reload ownership.
- Do not change the route namespace or add alternate aliases.
- Do not modify unrelated user work, lockfiles, dependencies, or generated outputs.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Final route grammar and typed route model.
2. How one scene component is hosted directly for view and inside Studio for edit.
3. How editor-only helper ownership was moved out of shared playback runtime.
4. Evidence that playback has no Studio/editor camera and uses the app default camera.
5. Evidence that persisted transforms, keyframes, and Spark settings are identical across modes.
6. Evidence that edit-mode source sync still targets `baby_yoda.svelte`.
7. Cross-mode cleanup/history behavior.
8. Changed files and focused rationale.
9. Acceptance checklist mapped to non-vacuous tests.
10. Exact full-suite results and warning counts.
11. Confirmation that `AGENTS.md` was updated concisely.

Always write `status.md` as the final content change before committing and pushing. Re-check all acceptance criteria immediately before writing it. After writing the report, do not run more verification or modify files. Commit all intended changes, including the report, push the current branch, and stop.
