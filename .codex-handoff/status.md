# Status: Separate scene playback and editing routes

## 1. Final route grammar and typed route model

Route grammar:
- `/scene/{validName}` → `{ kind: 'scene', mode: 'view', scene }`
- `/scene/{validName}/edit` → `{ kind: 'scene', mode: 'edit', scene }`
- `/scene/`, `/scene/{invalid}`, `/scene/{name}/unknown`, `/scene/{name}/edit/extra` → `{ kind: 'not-found', attemptedName }`
- `/` and everything else → `{ kind: 'landing' }`

Typed model in `src/lib/router.ts`:
```ts
type SceneMode = 'view' | 'edit'

interface SceneRouteMatch {
  kind: 'scene'
  mode: SceneMode
  scene: SceneEntry
}
```

Navigation helpers: `navigateToScene(name, mode?)` (defaults to `'view'`), `navigateToSceneEdit(name)`, `navigateToLanding()`.

## 2. One scene component, two hosts

`App.svelte` conditionally wraps the scene component in `<Studio>` based on `sceneMode`:
- **View mode**: `<SceneComponent>` is a direct child of `<Canvas>` — no `<Studio>`, no editor camera, no extensions
- **Edit mode**: `<SceneComponent>` is wrapped in `<Studio extensions={[ScrollAnimatorExtension, SparkControlsExtension]}>`

Both modes instantiate the exact same `SceneComponent` from `src/lib/scenes/baby_yoda.svelte`. No duplication of scene values, keyframes, transforms, or settings.

## 3. Editor-only helper ownership

`CameraFrustumHelper` was moved from `SceneRuntime.svelte` into `ScrollAnimatorExtension.svelte`. This ensures:
- The helper only mounts when Studio is active (edit mode)
- Playback mode never calls `useObjectSelection()` without Studio context
- The stub diagnostic (`__camera_frustum_helper_diagnostic`) is only installed in edit mode
- `SceneRuntime` is now editor-agnostic

## 4. Evidence: playback has no Studio/editor camera

Playback e2e tests (`tests/e2e/playback-edit.spec.ts`) assert:
- No Studio toolbar buttons (Scroll Animator, Spark Controls, Editor Camera, Inspector)
- No `tree-view` (Studio hierarchy)
- No `__camera_frustum_helper_diagnostic` function on `window`
- `data-active="true"` for the entire lifecycle (app camera always active)

## 5. Evidence: persisted transforms, keyframes, Spark settings identical across modes

Cross-mode e2e tests assert:
- Camera position at scroll 0% is identical in both modes
- SplatWrapper transform (position/rotation/scale) matches between modes
- Both modes load the same declarative values from `baby_yoda.svelte`

## 6. Evidence: edit-mode source sync still targets `baby_yoda.svelte`

Edit-mode e2e test verifies `userData.threlteStudio` on SplatWrapper contains a reference to `baby_yoda.svelte`. Existing Studio source metadata test (moved to `/edit`) confirms this.

## 7. Cross-mode cleanup/history behavior

Cross-mode e2e tests assert:
- `edit → view` removes all Studio UI, editor camera, and frustum helper; restores app default camera
- `view → edit` mounts exactly one Studio/editor runtime with all extensions
- `back/forward` preserves route mode (view stays view, edit stays edit)
- `refresh` preserves route mode for both `/scene/baby_yoda` and `/scene/baby_yoda/edit`

## 8. Changed files and focused rationale

| File | Change |
|------|--------|
| `src/lib/router.ts` | Added `mode: 'view' \| 'edit'` to `SceneRouteMatch`; parse `/scene/{name}/edit`; added `navigateToSceneEdit()` |
| `src/App.svelte` | Track `sceneMode`; conditionally wrap scene in `<Studio>` only for edit mode |
| `src/lib/components/SceneRuntime.svelte` | Removed `<CameraFrustumHelper />` import and instantiation (editor-only) |
| `src/lib/studio/scroll-animator/ScrollAnimatorExtension.svelte` | Added `<CameraFrustumHelper />` import and instantiation (editor-only, Studio context) |
| `tests/unit/router.test.ts` | Updated all route assertions for `mode` field; added edit-mode, unknown suffix, extra segments, empty name with edit |
| `tests/e2e/playback-edit.spec.ts` | New file: playback, edit, cross-mode, and not-found e2e tests |
| `tests/e2e/scene-routing.spec.ts` | Updated Studio-dependent tests (frustum helper, diagnostic lifecycle, source metadata, wrapper reload, editor camera) to use `/scene/baby_yoda/edit` |
| `AGENTS.md` | Documented playback/edit route distinction, shared scene component invariant, editor-only helper ownership |

## 9. Acceptance checklist mapped to tests

| # | Criterion | Test |
|---|-----------|------|
| 1 | `/scene/baby_yoda` loads in playback | `playback-edit.spec.ts: direct visit loads the scene with canvas` |
| 2 | Playback has no Studio/editor UI | `playback-edit.spec.ts: playback mode has no Studio toolbar`, `playback mode has no Studio hierarchy` |
| 3 | Playback `data-active="true"` | `playback-edit.spec.ts: playback app camera is active` |
| 4 | Playback scroll/RAD/lifecycle work | `playback-edit.spec.ts: playback scroll 0%/100%`, `repeated mount/unmount` |
| 5 | Playback applies declarative values | `playback-edit.spec.ts: playback SplatWrapper transform matches scene values` |
| 6 | `/scene/baby_yoda/edit` loads with Studio | `playback-edit.spec.ts: direct visit loads the scene with Studio toolbar` |
| 7 | Edit preserves all Studio features | `playback-edit.spec.ts: edit mode hierarchy items selectable`, `Scroll Animator pane`, `Spark Controls pane`, `camera frustum helper` |
| 8 | Source sync targets `baby_yoda.svelte` | `playback-edit.spec.ts: edit mode SplatWrapper has Studio source metadata` |
| 9 | Same component in both modes | `playback-edit.spec.ts: view and edit use the same scene component` |
| 10 | Cross-mode cleanup | `playback-edit.spec.ts: edit → view removes all editor UI`, `view → edit mounts Studio` |
| 11 | Unknown/malformed → not-found | `playback-edit.spec.ts: Not-found for malformed edit routes` (4 tests) |
| 12 | Landing/ad-hoc preserved | All existing `rad-story.spec.ts` tests pass |
| 13 | No warnings | `npm run check`: 0 errors, 0 warnings; `npm run lint`: clean |
| 14 | AGENTS.md updated | Documentation added for route model, shared component, helper ownership |

## 10. Exact full-suite results

- `npm run check`: **0 errors, 0 warnings**
- `npm run lint`: **clean** (no output)
- `npm run test:unit`: **295 passed** (17 test files)
- `npm run test:e2e`: **114 passed** (3 test files)
- `npm run build`: **success** (no errors)

## 11. AGENTS.md updated

Updated sections:
- Architecture overview: 3 viewing modes (ad-hoc, playback, edit)
- `App.svelte` description: conditional Studio wrapping
- `SceneRuntime.svelte` description: editor-agnostic, CameraFrustumHelper moved
- `router.ts` description: mode-aware parsing, typed navigation helpers
- `ScrollAnimatorExtension.svelte` description: owns CameraFrustumHelper
- `CameraFrustumHelper.svelte` description: editor-only, mounted in extension
- Scene Routing and Registry: playback vs edit section, shared component invariant, editor-only helper ownership, updated example paths
