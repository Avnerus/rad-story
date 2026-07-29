/**
 * Test stub for @sparkjsdev/spark.
 *
 * Used in e2e tests to avoid loading the real Spark library (which requires
 * a large remote RAD file and GPU-specific WebGL behavior).
 *
 * Activate with: VITE_E2E_STUB_SPARK=true
 */

import { Object3D } from 'three'

// Monotonic identity counter for pager/renderer instances (for e2e identity tests)
let _pagerIdCounter = 0
let _rendererIdCounter = 0

/** Stub pager that tracks identity and capacity. */
export class SplatPager {
  id: number
  maxSplats: number
  disposed = false

  constructor(options?: { maxSplats?: number }) {
    this.id = ++_pagerIdCounter
    this.maxSplats = options?.maxSplats ?? 16 * 65536
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
  pagerId: number

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
    _rendererIdCounter++ // keep counter ticking
    // Create a stub pager with capacity from options
    const maxPaged = typeof _options?.maxPagedSplats === 'number' ? _options.maxPagedSplats : 0
    if (maxPaged > 0) {
      this.pager = new SplatPager({ maxSplats: maxPaged })
      this.pagerId = this.pager.id
    }
    if (_options) {
      // Copy known fields from options
      for (const key of Object.keys(this) as (keyof SparkRenderer)[]) {
        if (_options[key] !== undefined) {
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
    // no-op stub
  }
}

export class SplatMesh extends Object3D {
  initialized: Promise<SplatMesh>
  paged: PagedSplats | undefined

  constructor(_options?: Record<string, unknown>) {
    super()
    // Resolve immediately — stub mesh is always "initialized"
    this.initialized = Promise.resolve(this)
    // Create a stub PagedSplats (pager will be set by the renderer during update)
    if (_options?.paged) {
      this.paged = new PagedSplats()
    }
  }

  dispose(): void {
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

/** Marker: proves the running build uses the Spark stub. */
;(() => {
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__spark_stub = true
  }
})()
