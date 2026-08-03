import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import type { SparkRendererOptions } from '@sparkjsdev/spark'
import type { SparkSettings } from './SparkControls'
import { SETTINGS_KEYS } from './SparkControls'

// ---------------------------------------------------------------------------
// Field classification for targeted dirty/invalidation
// ---------------------------------------------------------------------------

/**
 * Classify each setting into the kind of invalidation it requires.
 */
export enum ChangeKind {
  /** Shader/uniform-only — apply and mark render dirty */
  SHADER = 'shader',
  /** Sort-affecting — mark sort dirty */
  SORT = 'sort',
  /** LOD budget/traversal — mark LOD dirty */
  LOD = 'lod',
  /** Foveation — mark LOD dirty (re-traverse with new cone) */
  FOVEATION = 'foveation',
  /** Paging capacity — requires renderer recreation */
  RECREATE = 'recreate',
  /** LOD enable/disable — mark LOD dirty */
  LOD_TOGGLE = 'lod_toggle',
}

const FIELD_KINDS: Record<keyof SparkSettings, ChangeKind> = {
  lodSplatScale:       ChangeKind.LOD,
  lodRenderScale:      ChangeKind.LOD,
  maxStdDev:           ChangeKind.SHADER,
  maxPagedSplats:      ChangeKind.RECREATE,
  coneFov0:            ChangeKind.FOVEATION,
  coneFov:             ChangeKind.FOVEATION,
  coneFoveate:         ChangeKind.FOVEATION,
  behindFoveate:       ChangeKind.FOVEATION,
  minPixelRadius:      ChangeKind.SHADER,
  maxPixelRadius:      ChangeKind.SHADER,
  minAlpha:            ChangeKind.SHADER,
  preBlurAmount:       ChangeKind.SHADER,
  blurAmount:          ChangeKind.SHADER,
  falloff:             ChangeKind.SHADER,
  clipXY:              ChangeKind.SHADER,
  focalAdjustment:     ChangeKind.SHADER,
  sortRadial:          ChangeKind.SORT,
  minSortIntervalMs:   ChangeKind.SORT,
  enableLod:           ChangeKind.LOD_TOGGLE,
  enableLodFetching:   ChangeKind.LOD_TOGGLE,
  lodSplatCount:       ChangeKind.LOD,
  lodInflate:          ChangeKind.SHADER,
}

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

// ---------------------------------------------------------------------------
// Settings propagation helpers
// ---------------------------------------------------------------------------

/**
 * Exhaustive per-field setters for SparkRenderer.
 * Each entry correlates a SparkSettings key with its correct value type
 * and handles the lodSplatCount null → undefined conversion.
 */
const RENDERER_SETTERS: {
  [K in keyof SparkSettings]: (r: SparkRenderer, v: SparkSettings[K]) => void
} = {
  lodSplatScale:       (r, v) => { r.lodSplatScale = v },
  lodRenderScale:      (r, v) => { r.lodRenderScale = v },
  maxStdDev:           (r, v) => { r.maxStdDev = v },
  maxPagedSplats:      (r, v) => { r.maxPagedSplats = v },
  coneFov0:            (r, v) => { r.coneFov0 = v },
  coneFov:             (r, v) => { r.coneFov = v },
  coneFoveate:         (r, v) => { r.coneFoveate = v },
  behindFoveate:       (r, v) => { r.behindFoveate = v },
  minPixelRadius:      (r, v) => { r.minPixelRadius = v },
  maxPixelRadius:      (r, v) => { r.maxPixelRadius = v },
  minAlpha:            (r, v) => { r.minAlpha = v },
  preBlurAmount:       (r, v) => { r.preBlurAmount = v },
  blurAmount:          (r, v) => { r.blurAmount = v },
  falloff:             (r, v) => { r.falloff = v },
  clipXY:              (r, v) => { r.clipXY = v },
  focalAdjustment:     (r, v) => { r.focalAdjustment = v },
  sortRadial:          (r, v) => { r.sortRadial = v },
  minSortIntervalMs:   (r, v) => { r.minSortIntervalMs = v },
  enableLod:           (r, v) => { r.enableLod = v },
  enableLodFetching:   (r, v) => { r.enableLodFetching = v },
  lodSplatCount:       (r, v) => { r.lodSplatCount = v === null ? undefined : v },
  lodInflate:          (r, v) => { r.lodInflate = v },
}

/**
 * Set a single SparkSettings field on a SparkRenderer.
 * Uses the exhaustive setter map to preserve key/value correlation.
 */
function setRendererField<K extends keyof SparkSettings>(
  renderer: SparkRenderer,
  key: K,
  value: SparkSettings[K],
): void {
  RENDERER_SETTERS[key](renderer, value)
}

/**
 * Apply only the changed fields from `newSettings` to a SparkRenderer,
 * comparing against `oldSettings`. Returns the set of ChangeKinds that
 * were triggered.
 */
export function applyChangedSettings(
  renderer: SparkRenderer,
  oldSettings: SparkSettings,
  newSettings: SparkSettings,
): Set<ChangeKind> {
  const kinds = new Set<ChangeKind>()

  for (const key of SETTINGS_KEYS) {
    if (!LIVE_FIELDS.has(key)) continue
    const oldVal = oldSettings[key]
    const newVal = newSettings[key]
    if (oldVal === newVal) continue

    const kind = FIELD_KINDS[key]
    setRendererField(renderer, key, newVal)
    kinds.add(kind)
  }

  return kinds
}

/**
 * Mark a renderer's LOD as dirty so the next update cycle re-traverses.
 * Uses the public `lodDirty` flag from the installed Spark 2.1 declaration.
 */
export function markLodDirty(renderer: SparkRenderer): void {
  renderer.lodDirty = true
}

/**
 * Mark a renderer's sort as dirty.
 */
export function markSortDirty(renderer: SparkRenderer): void {
  renderer.sortDirty = true
}

/**
 * Mark a renderer's general dirty flag (triggers re-render).
 */
export function markDirty(renderer: SparkRenderer): void {
  renderer.setDirty()
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
   * Only changed fields are applied; appropriate dirty flags are set.
   * @param oldSettings - Previous validated settings snapshot.
   * @param newSettings - New validated settings snapshot.
   * @returns Whether any foveation or LOD field was changed.
   */
  applySettings(oldSettings: SparkSettings, newSettings: SparkSettings): boolean

  /**
   * Reconfigure the renderers with a new `maxPagedSplats` value.
   * Also applies all current settings from the provided snapshot so that
   * ordinary edits are not lost during recreation.
   *
   * @param currentSettings - Complete validated settings snapshot (includes new maxPagedSplats).
   */
  reconfigureMaxPagedSplats(currentSettings: SparkSettings): void
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

  function createRenderers(options?: SparkRendererOptions): void {
    if (disposed) return
    if (editorRenderer || realRenderer) return // idempotent

    const opts = options ?? sparkOptions

    // Editor renderer: LOD enabled but not driving
    editorRenderer = new SparkRenderer({
      ...opts,
      enableLod: true,
      enableDriveLod: false,
    })

    // Real-camera renderer: full LOD driving
    realRenderer = new SparkRenderer({
      ...opts,
      enableLod: true,
      enableDriveLod: true,
    })
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
   * Applies the complete current settings snapshot to the new renderers.
   */
  function replaceRenderers(settings: SparkSettings): void {
    if (disposed || recreateLock) return
    recreateLock = true

    try {
      const oldEditor = editorRenderer
      const oldReal = realRenderer

      // Remove old editor renderer from scene
      if (oldEditor && attachedScene) {
        attachedScene.remove(oldEditor)
      }

      // Build new options from current settings
      const newOptions: SparkRendererOptions = {
        ...sparkOptions,
        maxPagedSplats: settings.maxPagedSplats,
      }

      // Create new renderers
      editorRenderer = new SparkRenderer({
        ...newOptions,
        enableLod: true,
        enableDriveLod: false,
      })
      realRenderer = new SparkRenderer({
        ...newOptions,
        enableLod: true,
        enableDriveLod: true,
      })

      // Apply all live settings to new renderers (they already have maxPagedSplats from constructor)
      for (const r of [editorRenderer, realRenderer]) {
        applyLiveSettingsToRenderer(r, settings)
      }

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

  /**
   * Apply all live settings from a complete snapshot to a renderer.
   * Used after recreation to ensure new renderers have all settings.
   */
  function applyLiveSettingsToRenderer(r: SparkRenderer, settings: SparkSettings): void {
    for (const key of SETTINGS_KEYS) {
      if (!LIVE_FIELDS.has(key)) continue
      setRendererField(r, key, settings[key])
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

  function applySettings(oldSettings: SparkSettings, newSettings: SparkSettings): boolean {
    if (!editorRenderer || !realRenderer || disposed) return false

    let lodOrFoveationChanged = false

    for (const r of [editorRenderer, realRenderer]) {
      const kinds = applyChangedSettings(r, oldSettings, newSettings)

      // Apply appropriate dirty flags based on change classification
      for (const kind of kinds) {
        switch (kind) {
          case ChangeKind.FOVEATION:
          case ChangeKind.LOD:
            markLodDirty(r)
            lodOrFoveationChanged = true
            break
          case ChangeKind.LOD_TOGGLE:
            markLodDirty(r)
            lodOrFoveationChanged = true
            break
          case ChangeKind.SORT:
            markSortDirty(r)
            break
          case ChangeKind.SHADER:
            // setDirty triggers re-render
            break
        }
      }
    }

    // Mark general dirty so Threlte invalidate fires
    if (realRenderer) markDirty(realRenderer)

    return lodOrFoveationChanged
  }

  function reconfigureMaxPagedSplats(settings: SparkSettings): void {
    if (disposed) return

    // Update the base options so any future recreation uses the new value
    sparkOptions.maxPagedSplats = settings.maxPagedSplats

    // Replace both renderers with new instances, applying complete settings
    replaceRenderers(settings)

    // Mark dirty so the next frame triggers re-rendering
    if (realRenderer) {
      markLodDirty(realRenderer)
      markDirty(realRenderer)
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
