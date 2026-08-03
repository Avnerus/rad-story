import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import type { SparkRendererOptions } from '@sparkjsdev/spark'
import { createSparkStudioRenderer, applyChangedSettings, markLodDirty, markSortDirty, markDirty, ChangeKind } from '$lib/spark/createSparkStudioRenderer'
import { SparkControls, type SparkSettings } from '$lib/spark/SparkControls'
import { makeMockRenderer, makeMockScene } from './testHelpers'

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
  const c = new SparkControls()
  return c.settings
}

describe('applyChangedSettings', () => {
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

  it('applies only changed fields', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings }
    newSettings.lodSplatScale = 2

    const kinds = applyChangedSettings(r, oldSettings, newSettings)
    expect(r.lodSplatScale).toBe(2)
    expect(kinds).toContain(ChangeKind.LOD)
    // Only lodSplatScale changed
    expect(kinds.size).toBe(1)
  })

  it('returns empty set when nothing changed', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const s = makeDefaultSettings()
    const kinds = applyChangedSettings(r, s, s)
    expect(kinds.size).toBe(0)
  })

  it('classifies foveation changes correctly', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings }
    newSettings.coneFov0 = 60

    const kinds = applyChangedSettings(r, oldSettings, newSettings)
    expect(kinds).toContain(ChangeKind.FOVEATION)
    expect(r.coneFov0).toBe(60)
  })

  it('classifies shader-only changes correctly', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings }
    newSettings.falloff = 0.5

    const kinds = applyChangedSettings(r, oldSettings, newSettings)
    expect(kinds).toContain(ChangeKind.SHADER)
    expect(kinds.size).toBe(1)
  })

  it('classifies sort changes correctly', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings }
    newSettings.sortRadial = false

    const kinds = applyChangedSettings(r, oldSettings, newSettings)
    expect(kinds).toContain(ChangeKind.SORT)
  })

  it('maps lodSplatCount null to undefined on renderer', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    // First set to a number
    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings, lodSplatCount: 500_000 }
    applyChangedSettings(r, oldSettings, newSettings)
    expect(r.lodSplatCount).toBe(500_000)

    // Then set back to null (automatic)
    const newerSettings = { ...newSettings, lodSplatCount: null }
    applyChangedSettings(r, newSettings, newerSettings)
    expect(r.lodSplatCount).toBeUndefined()
  })

  it('supports automatic → numeric → automatic round-trip', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    const r = handle.realRenderer!

    const auto = makeDefaultSettings() // lodSplatCount: null
    const numeric = { ...auto, lodSplatCount: 1_000_000 }
    const autoAgain = { ...numeric, lodSplatCount: null }

    applyChangedSettings(r, auto, numeric)
    expect(r.lodSplatCount).toBe(1_000_000)

    applyChangedSettings(r, numeric, autoAgain)
    expect(r.lodSplatCount).toBeUndefined()
  })
})

describe('dirty marking functions', () => {
  let renderer: THREE.WebGLRenderer

  beforeEach(() => {
    vi.clearAllMocks()
    renderer = makeMockRenderer()
  })

  it('markLodDirty sets lodDirty to true', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(makeMockScene())
    const r = handle.realRenderer!

    r.lodDirty = false
    markLodDirty(r)
    expect(r.lodDirty).toBe(true)
  })

  it('markSortDirty sets sortDirty to true', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(makeMockScene())
    const r = handle.realRenderer!

    r.sortDirty = false
    markSortDirty(r)
    expect(r.sortDirty).toBe(true)
  })

  it('markDirty calls setDirty', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(makeMockScene())
    const r = handle.realRenderer!

    const setDirtySpy = vi.spyOn(r, 'setDirty')
    markDirty(r)
    expect(setDirtySpy).toHaveBeenCalled()
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

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings, lodSplatScale: 3 }
    handle.applySettings(oldSettings, newSettings)

    expect(handle.editorRenderer!.lodSplatScale).toBe(3)
    expect(handle.realRenderer!.lodSplatScale).toBe(3)
  })

  it('marks LOD dirty when foveation changes', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    handle.realRenderer!.lodDirty = false

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings, coneFov: 100 }
    const result = handle.applySettings(oldSettings, newSettings)
    expect(result).toBe(true)
    expect(handle.realRenderer!.lodDirty).toBe(true)
  })

  it('does not mark LOD dirty for shader-only changes', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    handle.realRenderer!.lodDirty = false

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings, falloff: 0.5 }
    const result = handle.applySettings(oldSettings, newSettings)
    expect(result).toBe(false)
    expect(handle.realRenderer!.lodDirty).toBe(false)
  })

  it('preserves enableDriveLod invariant', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings, blurAmount: 0.5 }
    handle.applySettings(oldSettings, newSettings)

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

    const newSettings = makeDefaultSettings()
    newSettings.maxPagedSplats = 2 * 65_536
    handle.reconfigureMaxPagedSplats(newSettings)

    // New instances created
    expect(handle.realRenderer).not.toBe(oldReal)
    expect(handle.editorRenderer).not.toBe(oldEditor)
    expect(handle.realRenderer!.maxPagedSplats).toBe(2 * 65_536)
    expect(handle.editorRenderer!.maxPagedSplats).toBe(2 * 65_536)
  })

  it('preserves ordinary settings across recreation', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    // Apply some ordinary settings changes
    const oldSettings = makeDefaultSettings()
    const newSettings = { ...oldSettings, lodSplatScale: 3, falloff: 0.5, coneFov0: 60 }
    handle.applySettings(oldSettings, newSettings)

    // Verify they were applied
    expect(handle.realRenderer!.lodSplatScale).toBe(3)
    expect(handle.realRenderer!.falloff).toBe(0.5)
    expect(handle.realRenderer!.coneFov0).toBe(60)

    // Now change maxPagedSplats with the same settings
    const recreateSettings = { ...newSettings, maxPagedSplats: 2 * 65_536 }
    handle.reconfigureMaxPagedSplats(recreateSettings)

    // All settings should survive
    expect(handle.realRenderer!.lodSplatScale).toBe(3)
    expect(handle.realRenderer!.falloff).toBe(0.5)
    expect(handle.realRenderer!.coneFov0).toBe(60)
    expect(handle.realRenderer!.maxPagedSplats).toBe(2 * 65_536)
  })

  it('marks LOD dirty after reconfiguration', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    const newSettings = makeDefaultSettings()
    newSettings.maxPagedSplats = 2 * 65_536
    handle.reconfigureMaxPagedSplats(newSettings)
    expect(handle.realRenderer!.lodDirty).toBe(true)
  })

  it('preserves enableDriveLod after reconfiguration', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    const newSettings = makeDefaultSettings()
    newSettings.maxPagedSplats = 2 * 65_536
    handle.reconfigureMaxPagedSplats(newSettings)

    expect(handle.editorRenderer!.enableDriveLod).toBe(false)
    expect(handle.realRenderer!.enableDriveLod).toBe(true)
  })

  it('is safe after dispose', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    handle.dispose()
    const newSettings = makeDefaultSettings()
    newSettings.maxPagedSplats = 2 * 65_536
    handle.reconfigureMaxPagedSplats(newSettings)

    expect(handle.realRenderer).toBeNull()
  })

  it('handles rapid repeated capacity edits', () => {
    const baseOptions = makeBaseOptions(renderer)
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)

    // Rapid edits
    for (let i = 1; i <= 4; i++) {
      const newSettings = makeDefaultSettings()
      newSettings.maxPagedSplats = i * 65_536
      handle.reconfigureMaxPagedSplats(newSettings)
    }

    // Should end with the last value
    expect(handle.realRenderer!.maxPagedSplats).toBe(4 * 65_536)
    expect(handle.editorRenderer!.maxPagedSplats).toBe(4 * 65_536)
  })
})
