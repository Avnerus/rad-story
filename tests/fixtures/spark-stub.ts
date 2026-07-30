/**
 * Test stub for @sparkjsdev/spark.
 *
 * Used in e2e tests to avoid loading the real Spark library (which requires
 * a large remote RAD file and GPU-specific WebGL behavior).
 *
 * Activate with: VITE_E2E_STUB_SPARK=true
 *
 * Pager handoff model: The driving renderer (enableDriveLod: true) discovers
 * active SplatMesh instances during its update cycle and assigns its pager
 * to each mesh's `paged.pager`. This mirrors real Spark behavior where pager
 * attachment occurs on the first render/update after the mesh is added to the scene.
 */

import { Object3D } from 'three'

// Monotonic identity counter for pager/renderer instances (for e2e identity tests)
let _pagerIdCounter = 0
let _rendererIdCounter = 0

// Instance tracking for e2e diagnostics
const _allPagers: SplatPager[] = []
const _allRenderers: SparkRenderer[] = []
const _allMeshes: SplatMesh[] = []
/** Test-only: reference to the current SplatWrapper for e2e transform assertions. */
let _testWrapper: Object3D | null = null

/** Stub pager that tracks identity and capacity. */
export class SplatPager {
  id: number
  maxSplats: number
  disposed = false

  constructor(options?: { maxSplats?: number }) {
    this.id = ++_pagerIdCounter
    this.maxSplats = options?.maxSplats ?? 16 * 65536
    _allPagers.push(this)
  }

  dispose(): void {
    this.disposed = true
  }
}

/** Stub PagedSplats that references a pager. */
export class PagedSplats {
  pager: SplatPager | undefined

  constructor(pager?: SplatPager) {
    this.pager = pager
  }

  dispose(): void {
    // no-op
  }
}

export class SparkRenderer extends Object3D {
  static sparkOverride: SparkRenderer | undefined

  pager: SplatPager | undefined
  pagerId: number = 0

  lodInstances = new Map<unknown, { lodId: number; numSplats: number; indices: Uint32Array; texture: unknown }>()

  // All settings fields — stubbed as plain properties
  enableLod = true
  enableDriveLod = true
  enableLodFetching = true
  lodDirty = false
  sortDirty = false
  maxPagedSplats = 0
  lodSplatScale = 1
  lodRenderScale = 1
  maxStdDev = 8
  coneFov0 = 90
  coneFov = 120
  coneFoveate = 0.4
  behindFoveate = 0.2
  minPixelRadius = 0
  maxPixelRadius = 512
  minAlpha = 0.002
  preBlurAmount = 0
  blurAmount = 0
  falloff = 1
  clipXY = 1.4
  focalAdjustment = 1
  sortRadial = true
  minSortIntervalMs = 0
  lodSplatCount: number | undefined
  lodInflate = false

  constructor(_options?: Record<string, unknown>) {
    super()
    ++_rendererIdCounter // keep counter ticking for diagnostics
    _allRenderers.push(this)
    // Marker so production code can detect stub builds
    ;(this as Record<string, unknown>).__spark_stub = true
    // Create a stub pager with capacity from options
    const maxPaged = typeof _options?.maxPagedSplats === 'number' ? _options.maxPagedSplats : 0
    if (maxPaged > 0) {
      this.pager = new SplatPager({ maxSplats: maxPaged })
      this.pagerId = this.pager.id
    }
    if (_options) {
      // Copy known fields from options
      for (const key of Object.keys(this) as (keyof SparkRenderer)[]) {
        if (_options[key] !== undefined && key !== 'id') {
          ;(this as Record<string, unknown>)[key] = _options[key]
        }
      }
    }
  }

  setDirty(): void {
    // no-op stub
  }

  dispose(): void {
    this.pager?.dispose()
    this.pager = undefined
  }

  onBeforeRender(_camera: unknown, _scene: unknown): void {
    // no-op stub — pager handoff is done via update()
  }

  /**
   * Stub update cycle: driving renderer assigns its pager to all
   * SplatMesh instances that don't yet have a pager attached.
   * This models the real Spark behavior where pager attachment happens
   * during the first render/update after mesh is added to the scene.
   *
   * In the stub, this is called by the waitForPagerHandoff RAF loop
   * to simulate the render-cycle pager assignment.
   * Uses global _allMeshes tracking since the driving renderer is
   * not added to the scene (unlike the editor renderer).
   *
   * Test-only gate: if `_stubActivationGate` is true, pager assignment
   * is withheld to allow deterministic progress-visibility assertions.
   */
  update(): void {
    if (!this.enableDriveLod || !this.pager || this.pager.disposed) return
    // Test-only gate: withhold pager assignment when gate is closed
    if ((globalThis as unknown as Record<string, unknown>).__stubActivationGate) return

    for (const mesh of _allMeshes) {
      if (mesh.type === 'SplatMesh' && mesh.paged && !mesh.paged.pager) {
        mesh.paged.pager = this.pager
      }
    }
  }
}

export class SplatMesh extends Object3D {
  declare type: string
  initialized: Promise<SplatMesh>
  paged: PagedSplats | undefined
  disposed = false

  constructor(_options?: Record<string, unknown>) {
    super()
    this.type = 'SplatMesh'
    _allMeshes.push(this)
    // Resolve after a microtask — gives UI time to render "reloading" state
    this.initialized = Promise.resolve().then(() => this)
    // Create a stub PagedSplats (pager will be set by the renderer during update)
    if (_options?.paged) {
      this.paged = new PagedSplats()
    }
  }

  dispose(): void {
    this.disposed = true
    this.paged?.dispose()
    this.paged = undefined
  }

  addEventListener(_type: string, _handler: unknown): void {
    // no-op
  }

  removeEventListener(_type: string, _handler: unknown): void {
    // no-op
  }
}

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * Stub diagnostics exposed on window for e2e verification.
 * Provides access to renderer/pager/mesh identities, generation, and disposal state.
 */
interface StubDiagnostics {
  /** All SplatPager instances ever created (includes disposed ones). */
  pagers: SplatPager[]
  /** All SparkRenderer instances ever created (includes disposed ones). */
  renderers: SparkRenderer[]
  /** All SplatMesh instances ever created (includes disposed ones). */
  meshes: SplatMesh[]
  /** Current driving renderer's pager ID (or 0 if none). */
  drivingPagerId: number
  /** Current driving renderer's generation (matches request generation). */
  drivingGeneration: number
  /** Test-only: current SplatWrapper for e2e transform assertions. */
  wrapper: Object3D | null
}

/** Marker: proves the running build uses the Spark stub. */
;(() => {
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__spark_stub = true

    // Test-only: hook for SparkSplats to register its wrapper
    ;(window as unknown as Record<string, unknown>).__spark_stub_set_wrapper = (w: Object3D) => {
      _testWrapper = w
    }

    Object.defineProperty(window, '__spark_stub_diagnostics', {
      configurable: true,
      get(): StubDiagnostics {
        // Find the current driving renderer (latest non-disposed with enableDriveLod)
        let drivingRenderer: SparkRenderer | null = null
        for (const r of _allRenderers) {
          if (r.enableDriveLod && r.pager && !r.pager.disposed) {
            drivingRenderer = r
          }
        }
        return {
          pagers: _allPagers.slice(),
          renderers: _allRenderers.slice(),
          meshes: _allMeshes.slice(),
          get drivingPagerId() {
            return drivingRenderer?.pager?.id ?? 0
          },
          get drivingGeneration() {
            // The driving renderer's pager ID serves as a generation proxy
            return drivingRenderer?.pager?.id ?? 0
          },
          /** Test-only: current SplatWrapper for e2e transform assertions. */
          get wrapper() {
            return _testWrapper
          },
        }
      },
    })
  }
})()
