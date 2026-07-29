import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import type { SparkRendererOptions } from '@sparkjsdev/spark'
import type { SparkSettings } from './SparkControls'

// ---------------------------------------------------------------------------
// Settings propagation helpers
// ---------------------------------------------------------------------------

/**
 * Fields that can be applied live to a SparkRenderer after construction
 * without requiring renderer/pager recreation.
 */
const LIVE_FIELDS = new Set<keyof SparkSettings>([
  'lodSplatScale',
  'lodRenderScale',
  'maxStdDev',
  'coneFov0',
  'coneFov',
  'coneFoveate',
  'behindFoveate',
  'minPixelRadius',
  'maxPixelRadius',
  'minAlpha',
  'preBlurAmount',
  'blurAmount',
  'falloff',
  'clipXY',
  'focalAdjustment',
  'sortRadial',
  'minSortIntervalMs',
  'enableLod',
  'enableLodFetching',
  'lodSplatCount',
  'lodInflate',
])

/**
 * Subset of live fields that affect the foveation cone and must trigger
 * an LOD recomputation even if the camera hasn't moved.
 */
const FOVEATION_FIELDS = new Set<keyof SparkSettings>([
  'coneFov0',
  'coneFov',
  'coneFoveate',
  'behindFoveate',
])

/**
 * Apply live settings to a SparkRenderer. Does not modify `enableDriveLod`.
 *
 * @returns Whether any foveation field was changed (caller should mark LOD dirty).
 */
export function applyLiveSettings(
  renderer: SparkRenderer,
  settings: SparkSettings,
): boolean {
  let foveationChanged = false

  for (const [key, value] of Object.entries(settings)) {
    const k = key as keyof SparkRenderer
    if (!LIVE_FIELDS.has(key as keyof SparkSettings)) continue
    if (key === 'lodSplatCount' && value === null) continue

    ;(renderer as unknown as Record<string, unknown>)[k] = value
    if (FOVEATION_FIELDS.has(key as keyof SparkSettings)) {
      foveationChanged = true
    }
  }

  return foveationChanged
}

/**
 * Mark a renderer's LOD as dirty so the next update cycle re-traverses.
 * Uses the public `lodDirty` flag from the installed Spark 2.1 declaration.
 */
export function markLodDirty(renderer: SparkRenderer): void {
  renderer.lodDirty = true
}

// ---------------------------------------------------------------------------
// Handle interface
// ---------------------------------------------------------------------------

/**
 * Manages the dual-SparkRenderer architecture required for Threlte Studio
 * editor-camera safety.
 *
 * - **Editor renderer**: `enableLod: true`, `enableDriveLod: false`. Added to
 *   the Three scene so it receives `onBeforeRender` calls for every render pass.
 *   It sorts splats for the current camera's view but never drives LOD fetching
 *   or pager updates.
 *
 * - **Real-camera renderer**: `enableLod: true`, `enableDriveLod: true`. Never
 *   added to the scene. Drives LOD selection from the application's real camera.
 *   Its `lodInstances` map is shared with the editor renderer so that editor
 *   renders display the same LOD selection.
 *
 * The editor renderer's `onBeforeRender` is wrapped to detect editor cameras
 * (`camera.userData.editorCamera === true`). Both branches pin their intended
 * Spark override for the duration of the original `onBeforeRender` callback
 * and restore the prior override in `try/finally`:
 *   - Editor camera → share LOD → sparkOverride = editorRenderer → call → restore
 *   - Real/default camera → sparkOverride = realRenderer → call → restore → share LOD
 */
export interface SparkStudioRendererHandle {
  /**
   * Attach this handle to a scene/renderer pair.
   * Safe to call multiple times (idempotent — no-op if already attached).
   */
  attach(scene: THREE.Scene): void

  /**
   * Dispose both Spark renderers and clean up. Safe to call multiple times.
   * After disposal all exposed references are nulled.
   */
  dispose(): void

  /** The editor (non-driving) SparkRenderer — added to scene. */
  editorRenderer: SparkRenderer | null

  /** The real-camera (driving) SparkRenderer — not added to scene. */
  realRenderer: SparkRenderer | null

  /**
   * Apply live settings to both renderers.
   * @param settings - Validated settings from SparkControls.
   * @returns Whether any foveation field was changed.
   */
  applySettings(settings: SparkSettings): boolean

  /**
   * Reconfigure the renderers with a new `maxPagedSplats` value.
   * This is required because `maxPagedSplats` is consumed when Spark creates
   * its pager, so a bare assignment after pager creation has no effect.
   *
   * The reconfiguration:
   * 1. Creates new SparkRenderer instances with the new capacity.
   * 2. Preserves the SplatMesh references and their pager attachments.
   * 3. Preserves the dual-renderer ownership and camera routing.
   * 4. Does not leak workers, textures, or scene objects.
   * 5. Is idempotent — safe if called repeatedly or during disposal.
   */
  reconfigureMaxPagedSplats(maxPagedSplats: number): void
}

/**
 * Factory to create a dual-SparkRenderer setup for Studio-safe LOD rendering.
 *
 * @param sparkOptions - Base Spark options derived from the device profile.
 *                       Must include `renderer` (supplied by Threlte Canvas).
 * @returns A handle controlling attach / dispose lifecycle.
 */
export function createSparkStudioRenderer(
  sparkOptions: SparkRendererOptions,
): SparkStudioRendererHandle {
  let editorRenderer: SparkRenderer | null = null
  let realRenderer: SparkRenderer | null = null
  let attachedScene: THREE.Scene | null = null
  let disposed = false
  let recreateLock = false // Prevent concurrent recreation

  function createRenderers(): void {
    if (disposed) return
    if (editorRenderer || realRenderer) return // idempotent

    const baseOptions = { ...sparkOptions }

    // Editor renderer: LOD enabled but not driving
    const editorOptions: SparkRendererOptions = {
      ...baseOptions,
      enableLod: true,
      enableDriveLod: false,
    }
    editorRenderer = new SparkRenderer(editorOptions)

    // Real-camera renderer: full LOD driving
    const realOptions: SparkRendererOptions = {
      ...baseOptions,
      enableLod: true,
      enableDriveLod: true,
    }
    realRenderer = new SparkRenderer(realOptions)
  }

  function shareLodInstances(): void {
    if (!realRenderer || !editorRenderer) return
    editorRenderer.lodInstances.clear()
    for (const [mesh, data] of realRenderer.lodInstances) {
      editorRenderer.lodInstances.set(mesh, data)
    }
  }

  function wrapOnBeforeRender(): void {
    if (!editorRenderer || !realRenderer) return

    const originalOnBeforeRender = editorRenderer.onBeforeRender.bind(editorRenderer)

    editorRenderer.onBeforeRender = (
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.Camera,
    ): void => {
      const callWithOverride = (spark: SparkRenderer): void => {
        const previous = SparkRenderer.sparkOverride
        try {
          SparkRenderer.sparkOverride = spark
          originalOnBeforeRender(renderer, scene, camera)
        } finally {
          SparkRenderer.sparkOverride = previous
        }
      }

      if (camera.userData.editorCamera === true) {
        // Editor camera: share LOD from real renderer, pin override to editorRenderer
        shareLodInstances()
        callWithOverride(editorRenderer!)
      } else {
        // Real/default camera: pin override to realRenderer (drives LOD), then share
        callWithOverride(realRenderer!)
        shareLodInstances()
      }
    }
  }

  /**
   * Internal: replace both renderers with new instances.
   * Preserves scene membership (editor renderer), wraps onBeforeRender,
   * and shares pager attachments from the old renderers' lodMeshes.
   */
  function replaceRenderers(): void {
    if (disposed || recreateLock) return
    recreateLock = true

    try {
      const oldEditor = editorRenderer
      const oldReal = realRenderer

      // Remove old editor renderer from scene
      if (oldEditor && attachedScene) {
        attachedScene.remove(oldEditor)
      }

      // Create new renderers with the same base options
      const baseOptions = { ...sparkOptions }

      editorRenderer = new SparkRenderer({
        ...baseOptions,
        enableLod: true,
        enableDriveLod: false,
      })
      realRenderer = new SparkRenderer({
        ...baseOptions,
        enableLod: true,
        enableDriveLod: true,
      })

      // Add new editor renderer to scene
      if (attachedScene) {
        attachedScene.add(editorRenderer)
      }

      // Wrap onBeforeRender for new editor renderer
      wrapOnBeforeRender()

      // Dispose old renderers (this disposes their pagers, workers, etc.)
      oldEditor?.dispose()
      oldReal?.dispose()
    } finally {
      recreateLock = false
    }
  }

  function attach(scene: THREE.Scene): void {
    if (disposed) return
    if (attachedScene === scene) return // idempotent

    createRenderers()
    if (!editorRenderer || !realRenderer) return

    attachedScene = scene

    // Add only the editor renderer to the scene
    scene.add(editorRenderer)

    // Wrap onBeforeRender to route LOD driving by camera type
    wrapOnBeforeRender()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true

    // Remove only the scene-owned editor renderer
    if (editorRenderer && attachedScene) {
      attachedScene.remove(editorRenderer)
    }

    // Dispose both Spark renderers
    editorRenderer?.dispose()
    realRenderer?.dispose()

    // Clear references
    editorRenderer = null
    realRenderer = null
    attachedScene = null
  }

  function applySettings(settings: SparkSettings): boolean {
    if (!editorRenderer || !realRenderer || disposed) return false

    let foveationChanged = false

    for (const r of [editorRenderer, realRenderer]) {
      foveationChanged = applyLiveSettings(r, settings) || foveationChanged
    }

    // If foveation changed, mark LOD dirty on the real renderer (the driver)
    if (foveationChanged && realRenderer) {
      markLodDirty(realRenderer)
    }

    return foveationChanged
  }

  function reconfigureMaxPagedSplats(maxPagedSplats: number): void {
    if (disposed) return

    // Update the base options so new renderers use the new value
    sparkOptions.maxPagedSplats = maxPagedSplats

    // Also set on current renderers immediately (for the period before recreation)
    if (editorRenderer) editorRenderer.maxPagedSplats = maxPagedSplats
    if (realRenderer) realRenderer.maxPagedSplats = maxPagedSplats

    // Replace both renderers so the new pager capacity takes effect
    replaceRenderers()

    // Mark dirty so the next frame triggers re-rendering
    if (realRenderer) {
      markLodDirty(realRenderer)
    }
  }

  return {
    attach,
    dispose,
    applySettings,
    reconfigureMaxPagedSplats,
    get editorRenderer() {
      return editorRenderer
    },
    get realRenderer() {
      return realRenderer
    },
  }
}
