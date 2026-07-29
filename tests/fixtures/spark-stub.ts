/**
 * Test stub for @sparkjsdev/spark.
 *
 * Used in e2e tests to avoid loading the real Spark library (which requires
 * a large remote RAD file and GPU-specific WebGL behavior).
 *
 * Activate with: VITE_E2E_STUB_SPARK=true
 */

import { Object3D } from 'three'

export class SparkRenderer extends Object3D {
  static sparkOverride: SparkRenderer | undefined

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
    // no-op
  }

  onBeforeRender(_camera: unknown, _scene: unknown): void {
    // no-op stub
  }
}

export class SplatMesh extends Object3D {
  initialized: Promise<SplatMesh>

  constructor(_options?: Record<string, unknown>) {
    super()
    // Resolve immediately — stub mesh is always "initialized"
    this.initialized = Promise.resolve(this)
  }

  dispose(): void {
    // no-op
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
