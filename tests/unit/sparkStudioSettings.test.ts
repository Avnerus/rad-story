import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import type { SparkRendererOptions } from '@sparkjsdev/spark'
import { createSparkStudioRenderer, applyLiveSettings, markLodDirty } from '$lib/spark/createSparkStudioRenderer'
import type { SparkSettings } from '$lib/spark/SparkControls'

/** Build a minimal mock WebGLRenderer. */
function makeMockRenderer(): THREE.WebGLRenderer {
  return {
    render: vi.fn(),
    domElement: {} as HTMLCanvasElement,
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    setScissorTest: vi.fn(),
    setScissor: vi.fn(),
    setViewport: vi.fn(),
    getDrawingBufferSize: vi.fn(() => ({ width: 800, height: 600 }) as THREE.Vector2),
    info: { render: { frame: 0 } },
    capabilities: { maxTextureSize: 4096 },
    xr: { isPresenting: false },
  } as unknown as THREE.WebGLRenderer
}

/** Build a minimal mock scene. */
function makeMockScene(): THREE.Scene {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    children: [],
  } as unknown as THREE.Scene
}

/** Base Spark options used by most tests. */
function makeBaseOptions(renderer: THREE.WebGLRenderer): SparkRendererOptions {
  return {
    renderer,
    pagedExtSplats: true,
    lodSplatScale: 1,
    lodRenderScale: 1,
    maxStdDev: 8,
    maxPagedSplats: 1_048_576,
    coneFov0: 90,
    coneFov: 120,
    coneFoveate: 0.4,
    behindFoveate: 0.2,
  }
}

// Save the real prototype method once
const realProtoOnBeforeRender = SparkRenderer.prototype.onBeforeRender

/** Build a default SparkSettings object. */
function makeDefaultSettings(): SparkSettings {
  return {
    lodSplatScale: 1,
    lodRenderScale: 1,
    maxStdDev: 8,
    maxPagedSplats: 16 * 65_536,
    coneFov0: 90,
    coneFov: 120,
    coneFoveate: 0.4,
    behindFoveate: 0.2,
    minPixelRadius: 0,
    maxPixelRadius: 512,
    minAlpha: 0.5 * (1 / 255),
    preBlurAmount: 0,
    blurAmount: 0,
    falloff: 1,
    clipXY: 1.4,
    focalAdjustment: 1,
    sortRadial: true,
    minSortIntervalMs: 0,
    enableLod: true,
    enableLodFetching: true,
    lodSplatCount: null,
    lodInflate: false,
  }
}

describe('applyLiveSettings', () => {
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene

  beforeEach(() => {
    vi.clearAllMocks()
    SparkRenderer.sparkOverride = undefined
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
    renderer = makeMockRenderer()
    scene = makeMockScene()
  })

  afterEach(() => {
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
  })

  it('applies ordinary settings to a SparkRenderer', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const settings = makeDefaultSettings()
    settings.lodSplatScale = 2
    settings.maxStdDev = 12
    settings.falloff = 0.5

    applyLiveSettings(r, settings)

    expect(r.lodSplatScale).toBe(2)
    expect(r.maxStdDev).toBe(12)
    expect(r.falloff).toBe(0.5)
  })

  it('returns true when foveation fields change', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const settings = makeDefaultSettings()
    settings.coneFov0 = 60

    const foveationChanged = applyLiveSettings(r, settings)
    expect(foveationChanged).toBe(true)
    expect(r.coneFov0).toBe(60)
  })

  it('returns false when only non-foveation fields change', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    // Only pass non-foveation fields
    const settings = { ...makeDefaultSettings() } as Record<string, unknown>
    // Delete foveation fields so they are not in the iteration
    delete settings.coneFov0
    delete settings.coneFov
    delete settings.coneFoveate
    delete settings.behindFoveate
    settings.falloff = 0.5

    const foveationChanged = applyLiveSettings(r, settings as unknown as SparkSettings)
    expect(foveationChanged).toBe(false)
    expect(r.falloff).toBe(0.5)
  })

  it('does not modify enableDriveLod', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    expect(r.enableDriveLod).toBe(true)

    const settings = makeDefaultSettings()
    // Even if enableLod is in settings, enableDriveLod should not be touched
    applyLiveSettings(r, settings)

    expect(r.enableDriveLod).toBe(true)
  })

  it('skips lodSplatCount when null', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const settings = makeDefaultSettings()
    settings.lodSplatCount = null // automatic

    applyLiveSettings(r, settings)

    // Should not have set lodSplatCount to null
    expect(r.lodSplatCount).toBeUndefined()
  })
})

describe('markLodDirty', () => {
  let renderer: THREE.WebGLRenderer

  beforeEach(() => {
    vi.clearAllMocks()
    renderer = makeMockRenderer()
  })

  it('sets lodDirty to true', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(makeMockScene())
    const r = handle.realRenderer!

    r.lodDirty = false
    markLodDirty(r)
    expect(r.lodDirty).toBe(true)
  })
})

describe('SparkStudioRendererHandle.applySettings', () => {
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene

  beforeEach(() => {
    vi.clearAllMocks()
    SparkRenderer.sparkOverride = undefined
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
    renderer = makeMockRenderer()
    scene = makeMockScene()
  })

  afterEach(() => {
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
  })

  it('applies settings to both editor and real renderers', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    const settings = makeDefaultSettings()
    settings.lodSplatScale = 3

    handle.applySettings(settings)

    expect(handle.editorRenderer!.lodSplatScale).toBe(3)
    expect(handle.realRenderer!.lodSplatScale).toBe(3)
  })

  it('marks LOD dirty when foveation changes', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    handle.realRenderer!.lodDirty = false

    const settings = makeDefaultSettings()
    settings.coneFov = 100

    const result = handle.applySettings(settings)
    expect(result).toBe(true)
    expect(handle.realRenderer!.lodDirty).toBe(true)
  })

  it('preserves enableDriveLod invariant', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    handle.applySettings(makeDefaultSettings())

    expect(handle.editorRenderer!.enableDriveLod).toBe(false)
    expect(handle.realRenderer!.enableDriveLod).toBe(true)
  })
})

describe('SparkStudioRendererHandle.reconfigureMaxPagedSplats', () => {
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene

  beforeEach(() => {
    vi.clearAllMocks()
    SparkRenderer.sparkOverride = undefined
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
    renderer = makeMockRenderer()
    scene = makeMockScene()
  })

  afterEach(() => {
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
  })

  it('creates new renderer instances with updated maxPagedSplats', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    const oldReal = handle.realRenderer!
    const oldEditor = handle.editorRenderer!

    handle.reconfigureMaxPagedSplats(2 * 65_536)

    // New instances created
    expect(handle.realRenderer).not.toBe(oldReal)
    expect(handle.editorRenderer).not.toBe(oldEditor)
    expect(handle.realRenderer!.maxPagedSplats).toBe(2 * 65_536)
    expect(handle.editorRenderer!.maxPagedSplats).toBe(2 * 65_536)
  })

  it('marks LOD dirty after reconfiguration', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    handle.reconfigureMaxPagedSplats(2 * 65_536)
    expect(handle.realRenderer!.lodDirty).toBe(true)
  })

  it('preserves enableDriveLod after reconfiguration', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    handle.reconfigureMaxPagedSplats(2 * 65_536)

    expect(handle.editorRenderer!.enableDriveLod).toBe(false)
    expect(handle.realRenderer!.enableDriveLod).toBe(true)
  })

  it('is safe after dispose', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    handle.dispose()
    handle.reconfigureMaxPagedSplats(2 * 65_536)

    expect(handle.realRenderer).toBeNull()
  })
})
