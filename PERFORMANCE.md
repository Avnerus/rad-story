# RAD Story performance guide

This guide targets Spark 2.1 paged RAD scenes in this application. The primary
goal is to minimize visible coarse-to-fine loading while the camera moves at a
moderate speed and continues to look at a fixed target.

## Recommended starting point

1. Use a prebuilt, quality LoD RAD asset. For separately cacheable chunks,
   build with `--quality --rad-chunked`; otherwise use a single RAD file with
   byte-range support. The app already loads every scene with `paged: true`.
2. Keep `lodSplatCount` on `null` (Spark's platform-dependent automatic
   budget) and tune `lodSplatScale`. More splats are not always better: a large
   budget takes longer to select, fetch, decode, upload, and replace after the
   camera moves.
3. Make the full-detail foveation cone cover the complete camera frustum plus a
   motion margin. With this app's 60-degree vertical camera, a 16:9 viewport has
   a roughly 99-degree diagonal field of view, so a 90-degree full-detail cone
   does not cover its corners.
4. Start with a full-detail cone around 105-115 degrees on desktop, followed by
   a broad transition cone around 140-160 degrees. Start with
   `coneFoveate` around 0.15-0.3 and `behindFoveate` around 0.05-0.1. Test the
   entire authored camera path before tightening the cone or lowering the
   outside scales.
5. Try `lodRenderScale` between 1.5 and 2 before raising the splat budget. Spark
   documents values as high as 5 as often visually indistinguishable; a higher
   value avoids spending budget and bandwidth on sub-pixel detail.
6. Give the pager enough capacity to retain the working set across adjacent
   camera poses. Raise `maxPagedSplats` only while measuring memory and page
   churn; capacity does not itself make the network faster.
7. Preserve frame-time headroom. LoD traversal, decoded-page uploads, sorting,
   and rendering share the interactive workload. A scene that barely meets its
   frame budget when static is likely to show refinement lag while moving.

These are starting ranges, not universal presets. Network latency, asset tree
quality, camera radius, viewport aspect ratio, and the spatial distribution of
splats all affect the best values.

## How Spark 2.1 selects and fetches paged splats

Spark has two related priority mechanisms:

- LoD traversal allocates a fixed splat budget using the current camera pose,
  projected size, per-mesh `lodScale`, and the four foveation parameters.
- For paged RAD data, the traversal returns the chunks needed by that LoD
  selection. Spark converts this result into the pager's ordered
  `fetchPriority` list.

Inspection of the installed `@sparkjsdev/spark` 2.1.0 implementation shows the
following fetch order:

1. Chunk 0 (the coarse root) of every paged `SplatMesh`, ordered by the mesh
   origin's distance from the camera.
2. Non-root chunks returned by the current LoD traversal, in traversal order.
3. The pager walks that list from the front and starts work until its page and
   parallel-fetch limits are reached.

The traversal receives `behindFoveate`, `coneFov0`, `coneFov`, and
`coneFoveate`. The foveation shape therefore affects both what detail Spark
selects and which detail chunks enter the ordered fetch list. There is no
separate public "frustum fetch priority" control or custom priority callback in
the Spark 2.1 API used here.

Already-running fetches are not cancelled merely because a new camera pose
produces a new priority list. A rapidly changing pose can therefore spend some
worker/network capacity finishing requests selected by an earlier pose. This is
one reason a stable camera path, a reasonable LoD budget, and a generous cone
margin work better than a very narrow high-detail cone.

Spark contains no active public future-camera prefetch API in 2.1. The installed
source has a commented-out `setPrefetchCameras` sketch, but it is not usable
application API and must not be relied on.

## Foveation for this camera path

`coneFov0` and `coneFov` are full-width angular cones around the current view
direction; they are not exact rectangular-frustum tests:

- From the view direction through `coneFov0`, LoD detail scale is 1.0.
- From `coneFov0` through `coneFov`, it falls smoothly to `coneFoveate`.
- From `coneFov` through 180 degrees behind the camera, it falls smoothly to
  `behindFoveate`.

For a perspective camera, a useful lower bound for `coneFov0` is the diagonal
field of view rather than only the vertical field of view:

```text
diagonalFov = 2 * atan(tan(verticalFov / 2) * sqrt(1 + aspect^2))
```

For the app camera's 60-degree vertical FOV this is approximately:

| Viewport | Diagonal FOV |
| --- | ---: |
| 16:9 landscape | 99 degrees |
| 4:3 landscape | 87 degrees |
| 9:16 portrait | 68 degrees |

Add a margin beyond that lower bound. When the camera position animates while
its target stays fixed, the view direction rotates continuously. Geometry just
outside the current frustum may enter it soon, and Spark cannot know the future
keyframe path. A wider `coneFov0` retains full detail around the visible frame;
a still wider `coneFov` makes the falloff gradual enough to serve as approximate
look-ahead.

A narrow cone with very low outside scales maximizes detail at the exact center
of a static view, but is more likely to reveal coarse regions during camera
motion. Optimize for the path, not a single frame.

### Practical foveation profiles

Use these as experiment baselines:

| Goal | `coneFov0` | `coneFov` | `coneFoveate` | `behindFoveate` |
| --- | ---: | ---: | ---: | ---: |
| Smooth 16:9 target-orbit motion | 110 | 150 | 0.25 | 0.08 |
| More bandwidth-constrained | 105 | 140 | 0.15 | 0.05 |
| Fast motion or variable aspect | 120 | 165 | 0.3 | 0.1 |

Do not evaluate these only from final sharpness. Scrub the complete scroll
animation forward and backward after a cold cache load and watch the frame
edges, disoccluded surfaces, and the area around the fixed target.

## Controls exposed by RAD Story

The Spark Controls Studio pane writes profile-specific scene overrides. The
following controls matter most for perceived loading, in priority order:

| Control | Loading/refinement effect | Guidance |
| --- | --- | --- |
| `coneFov0` | Sets the full-detail angular region | Cover the diagonal frustum plus motion margin. |
| `coneFov` | Sets the end of the transition region | Widen it to keep near-frustum detail warmer. |
| `coneFoveate` | Detail scale at `coneFov` | Lower values save outside-cone budget; values that are too low expose refinement during turns. |
| `behindFoveate` | Detail scale behind the viewer | Keep low for a forward-only story, but not necessarily zero if the path reverses. |
| `lodSplatScale` | Multiplies Spark's platform budget | Lower it if selection/refinement cannot keep up; raise it only with measured headroom. |
| `lodSplatCount` | Replaces the automatic platform budget | Prefer `null`; a fixed desktop-sized count harms mobile adaptability. |
| `lodRenderScale` | Rejects unnecessarily tiny LoD splats | Try 1.5-2 desktop and 2-3 mobile before adding budget. |
| `maxPagedSplats` | Pager-resident splat capacity | Raise to reduce eviction/re-fetch across the path; it must be a multiple of 65,536 and costs GPU memory. Changing it recreates the renderers and reloads the mesh in this app. |
| `enableLodFetching` | Permits missing LoD pages to stream | Leave enabled in normal playback. Disabling it freezes availability; it is useful only for diagnosis. |
| `enableLod` | Enables LoD selection | Leave enabled for large/streamed RAD scenes. |

The remaining exposed controls primarily affect rendering cost or appearance:

- `maxStdDev`: lower Gaussian extent reduces fill/blending cost. Spark's default
  is `sqrt(8)`, approximately 2.83; `sqrt(5)`, approximately 2.24, is a documented
  visually similar VR-oriented optimization.
- `minPixelRadius`, `maxPixelRadius`, `minAlpha`, `preBlurAmount`,
  `blurAmount`, `falloff`, and `focalAdjustment`: shader/appearance controls.
  Tune only with visual comparisons.
- `clipXY`: draw clipping for splat centers near the view boundary. It does not
  change LoD selection or paged-fetch priority.
- `sortRadial`: leave enabled for this animated camera unless a scene clearly
  renders better with Z-depth sorting. Radial sorting is more stable during
  viewpoint rotation.
- `minSortIntervalMs`: increasing it reduces sort frequency but can make motion
  visibly stale. It is not a streaming control; keep it at 0 while establishing
  the loading baseline.
- `lodInflate`: appearance/opacity preservation for LoD splats, not a fetch
  priority control.

`numLodFetchers` and per-mesh `SplatMesh.lodScale`/foveation overrides exist in
Spark 2.1 but are not exposed in this app's 22-field Studio pane. Spark defaults
to three parallel LoD fetchers and documents no benefit above four because the
fetchers share a four-worker pool. Three intentionally leaves one worker for
other loading and decoding work, so increasing concurrency should not be the
first optimization.

## Asset and delivery recommendations

- Precompute LoD offline with `--quality`. Browser-generated LoD adds startup
  work and cannot provide the same immediate paged experience.
- Prefer `--rad-chunked` when the host/CDN efficiently caches the `.radc`
  objects. For a monolithic RAD, verify byte-range requests, `206 Partial
  Content`, CORS headers, and CDN caching from the deployed origin.
- Keep chunk URLs immutable and cacheable. Avoid query strings or response
  headers that defeat caching between visits unless the asset changed.
- Limit spherical harmonics with `--max-sh` when the visual difference is
  acceptable. Fewer coefficients reduce asset size and decode/upload work.
- Use compact paged splats unless the asset genuinely needs extended coordinate
  precision. This app currently creates SparkRenderer with
  `pagedExtSplats: true`, which favors precision but uses the larger paged
  representation. Making this conditional is a potential optimization not
  currently exposed in Studio.
- Keep scene coordinates near a sensible origin when possible. Huge internal
  coordinates are the main reason to pay the extended-encoding cost.

## Rendering headroom already handled by the app

The application already follows two important Spark recommendations:

- `WebGLRenderer` is created with `antialias: false`.
- Device pixel ratio is capped: mobile uses DPR 1; desktop uses at most DPR 2.

For splat-heavy scenes that still miss frame targets, test desktop DPR 1-1.5.
Reducing pixel count lowers Gaussian blending cost and can leave more time for
LoD updates and page uploads. Judge this together with `maxStdDev`; both affect
fill cost, while only the LoD/foveation controls affect requested detail.

The app currently sets `pagedExtSplats: true` and uses two SparkRenderer
instances so Studio's editor camera cannot drive playback LoD. Only the real
application camera drives LoD selection and paging; the editor renderer shares
those LoD instances. This is desirable for authoring because moving the editor
camera cannot evict or fetch pages unrelated to the authored story camera.

## Spark settings configuration

`DESKTOP_BASELINE` and `MOBILE_BASELINE` in `src/lib/spark/deviceProfile.ts`
are the sole global source of all 22 Spark settings. Both initial SparkRenderer
instances receive the complete effective `SparkControls.settings` snapshot
(baseline + file-backed scene overrides) before their first meaningful render.
File-backed scenes persist `profileSettings` via source sync; the ad-hoc
dynamic URL viewer applies edits live but does not persist them.

`maxStdDev` is a direct standard-deviation extent. Prefer approximately 2.8 as
the quality baseline and approximately 2.24 as the first performance experiment.

## Tuning and validation procedure

Change one group at a time and test on the slowest supported device/network:

1. Build and serve the production RAD asset correctly.
2. Set `lodSplatCount = null`; choose a sustainable `lodSplatScale` and
   `lodRenderScale` while the camera moves.
3. Calculate the maximum diagonal FOV for supported viewport shapes. Set
   `coneFov0` above it, then add a transition region with `coneFov`.
4. Lower `coneFoveate` and `behindFoveate` until outside-view savings stop
   improving motion, then back off one step.
5. Increase `maxPagedSplats` only if repeated path segments visibly re-fetch or
   re-refine and memory remains safe.
6. Reduce `maxStdDev` and DPR if frame time, rather than network/page residency,
   is the limit.
7. Test cold cache, warm cache, forward scroll, backward scroll, resize/orient,
   and at least one brief faster-than-normal scrub.

Track separately:

- time to first useful image;
- duration of the initial loading overlay;
- visible coarse-to-fine refinement during motion;
- HTTP chunk requests and repeated requests;
- page-pool/GPU memory pressure;
- frame time and long frames during traversal/upload;
- visual edge artifacts caused by foveation, clipping, or delayed sorting.

## References

- [Spark performance tuning](https://sparkjs.dev/docs/performance/)
- [Spark Level-of-Detail guide](https://sparkjs.dev/docs/lod-getting-started/)
- [SparkRenderer options](https://sparkjs.dev/docs/spark-renderer/)
- Installed implementation: `node_modules/@sparkjsdev/spark` 2.1.0
- App integration: `src/lib/components/SparkSplats.svelte`,
  `src/lib/components/SparkStudioBridge.svelte`,
  `src/lib/spark/createSparkStudioRenderer.ts`, and
  `src/lib/spark/deviceProfile.ts`
