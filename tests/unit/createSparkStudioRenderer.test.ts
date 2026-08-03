import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import type { SparkRendererOptions } from '@sparkjsdev/spark'
import { createSparkStudioRenderer } from '$lib/spark/createSparkStudioRenderer'
import { makeMockRenderer, makeMockScene, makeMockSplatMesh, makeMockSparkRenderer } from './testHelpers'

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
    coneFoveate: 0.2,
    behindFoveate: 0.1,
  }
}

// Save the real prototype method once
const realProtoOnBeforeRender = SparkRenderer.prototype.onBeforeRender

describe('createSparkStudioRenderer', () => {
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let baseOptions: SparkRendererOptions

  beforeEach(() => {
    vi.clearAllMocks()
    SparkRenderer.sparkOverride = undefined
    // Reset prototype to real implementation before each test
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
    renderer = makeMockRenderer()
    scene = makeMockScene()
    baseOptions = makeBaseOptions(renderer)
  })

  afterEach(() => {
    // Always restore prototype after each test
    SparkRenderer.prototype.onBeforeRender = realProtoOnBeforeRender
  })

  /**
   * Helper: create a handle with a mocked onBeforeRender prototype.
   * The mock is set BEFORE attach so the bound original inside the wrap
   * captures the mock (not the real Spark implementation).
   */
  function createWithMockedOnBeforeRender(
    mockFn: ReturnType<typeof vi.fn> = vi.fn(),
  ) {
    SparkRenderer.prototype.onBeforeRender = mockFn
    const handle = createSparkStudioRenderer(baseOptions)
    handle.attach(scene)
    return { handle, mockFn }
  }

  describe('renderer creation and options', () => {
    it('creates two SparkRenderer instances on attach', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      expect(handle.editorRenderer).toBeNull()
      expect(handle.realRenderer).toBeNull()

      handle.attach(scene)

      expect(handle.editorRenderer).toBeInstanceOf(SparkRenderer)
      expect(handle.realRenderer).toBeInstanceOf(SparkRenderer)
    })

    it('editor renderer has enableDriveLod: false', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      expect(handle.editorRenderer!.enableDriveLod).toBe(false)
    })

    it('editor renderer has enableLod: true', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      expect(handle.editorRenderer!.enableLod).toBe(true)
    })

    it('real renderer has enableDriveLod: true', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      expect(handle.realRenderer!.enableDriveLod).toBe(true)
    })

    it('real renderer has enableLod: true', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      expect(handle.realRenderer!.enableLod).toBe(true)
    })

    it('passes device-profile Spark options through to both renderers', () => {
      const profileOptions: SparkRendererOptions = {
        ...baseOptions,
        lodSplatScale: 0.5,
        lodRenderScale: 2,
        maxStdDev: 4,
        maxPagedSplats: 262_144,
        coneFov0: 70,
        coneFov: 110,
        coneFoveate: 0.4,
        behindFoveate: 0.3,
      }
      const handle = createSparkStudioRenderer(profileOptions)
      handle.attach(scene)

      for (const label of ['editor', 'real'] as const) {
        const r = label === 'editor' ? handle.editorRenderer! : handle.realRenderer!
        expect(r.lodSplatScale).toBe(0.5)
        expect(r.lodRenderScale).toBe(2)
        expect(r.maxStdDev).toBe(4)
        expect(r.maxPagedSplats).toBe(262_144)
        expect(r.coneFov0).toBe(70)
        expect(r.coneFov).toBe(110)
        expect(r.coneFoveate).toBe(0.4)
        expect(r.behindFoveate).toBe(0.3)
      }
    })
  })

  describe('attach idempotence', () => {
    it('only adds editor renderer to scene once on repeated attach calls', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      handle.attach(scene)

      expect(scene.add).toHaveBeenCalledTimes(1)
      expect(scene.add).toHaveBeenCalledWith(handle.editorRenderer)
    })

    it('real renderer is never added to the scene', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      expect(scene.add).not.toHaveBeenCalledWith(handle.realRenderer)
    })
  })

  describe('onBeforeRender wrapping', () => {
    it('wraps editorRenderer.onBeforeRender after attach', () => {
      const { handle, mockFn } = createWithMockedOnBeforeRender()
      const editorR = handle.editorRenderer!

      expect(typeof editorR.onBeforeRender).toBe('function')
      // The wrapped function should call the mock
      const editorCamera = new THREE.PerspectiveCamera()
      editorCamera.userData.editorCamera = true
      editorR.onBeforeRender(renderer, scene, editorCamera)
      expect(mockFn).toHaveBeenCalled()
    })

    it('editor camera: shares lodInstances before calling original onBeforeRender', () => {
      const { handle, mockFn } = createWithMockedOnBeforeRender()
      const editorR = handle.editorRenderer!
      const realR = handle.realRenderer!

      const mockMesh = makeMockSplatMesh()
      const lodData = { lodId: 1, numSplats: 100, indices: new Uint32Array(100), texture: {} as THREE.DataTexture }
      realR.lodInstances.set(mockMesh, lodData)
      editorR.lodInstances.clear()

      const editorCamera = new THREE.PerspectiveCamera()
      editorCamera.userData.editorCamera = true

      SparkRenderer.sparkOverride = undefined
      editorR.onBeforeRender(renderer, scene, editorCamera)

      expect(editorR.lodInstances.get(mockMesh)).toBe(lodData)
      expect(mockFn).toHaveBeenCalled()
    })

    it('real camera: sets sparkOverride to realRenderer during original onBeforeRender', () => {
      let observedOverride: SparkRenderer | undefined
      const mockFn = vi.fn(() => {
        observedOverride = SparkRenderer.sparkOverride
      })
      const { handle } = createWithMockedOnBeforeRender(mockFn)
      const editorR = handle.editorRenderer!
      const realR = handle.realRenderer!

      const realCamera = new THREE.PerspectiveCamera()
      realCamera.userData.editorCamera = false

      SparkRenderer.sparkOverride = undefined
      editorR.onBeforeRender(renderer, scene, realCamera)

      // Inside the original call, override should be realRenderer
      expect(observedOverride).toBe(realR)
      expect((observedOverride as SparkRenderer).enableDriveLod).toBe(true)
      // After the call, override is restored
      expect(SparkRenderer.sparkOverride).toBeUndefined()
    })

    it('editor camera: sets sparkOverride to editorRenderer inside callback', () => {
      let observedOverride: SparkRenderer | undefined
      const mockFn = vi.fn(() => {
        observedOverride = SparkRenderer.sparkOverride
      })
      const { handle } = createWithMockedOnBeforeRender(mockFn)
      const editorR = handle.editorRenderer!

      const editorCamera = new THREE.PerspectiveCamera()
      editorCamera.userData.editorCamera = true

      SparkRenderer.sparkOverride = undefined
      editorR.onBeforeRender(renderer, scene, editorCamera)

      // Editor path pins override to editorRenderer
      expect(observedOverride).toBe(editorR)
      expect((observedOverride as SparkRenderer).enableDriveLod).toBe(false)
      // After the call, override is restored
      expect(SparkRenderer.sparkOverride).toBeUndefined()
    })

    it('editor camera: overrides a pre-existing non-undefined sparkOverride', () => {
      let observedOverride: SparkRenderer | undefined
      const mockFn = vi.fn(() => {
        observedOverride = SparkRenderer.sparkOverride
      })
      const { handle } = createWithMockedOnBeforeRender(mockFn)
      const editorR = handle.editorRenderer!

      const editorCamera = new THREE.PerspectiveCamera()
      editorCamera.userData.editorCamera = true

      // Simulate a pre-existing foreign override (e.g. from a nested render)
      const foreignOverride = makeMockSparkRenderer()
      SparkRenderer.sparkOverride = foreignOverride

      editorR.onBeforeRender(renderer, scene, editorCamera)

      // Inside the callback, override should be editorRenderer (not the foreign one)
      expect(observedOverride).toBe(editorR)
      // After the call, the foreign override is restored
      expect(SparkRenderer.sparkOverride).toBe(foreignOverride)
    })

    it('real camera: shares lodInstances after onBeforeRender', () => {
      const { handle } = createWithMockedOnBeforeRender()
      const editorR = handle.editorRenderer!
      const realR = handle.realRenderer!

      const mockMesh = makeMockSplatMesh()
      const lodData = { lodId: 42, numSplats: 200, indices: new Uint32Array(200), texture: {} as THREE.DataTexture }
      realR.lodInstances.set(mockMesh, lodData)
      editorR.lodInstances.clear()

      const realCamera = new THREE.PerspectiveCamera()
      realCamera.userData.editorCamera = false

      SparkRenderer.sparkOverride = undefined
      editorR.onBeforeRender(renderer, scene, realCamera)

      expect(editorR.lodInstances.get(mockMesh)).toBe(lodData)
    })
  })

  describe('override restoration', () => {
    it('preserves pre-existing sparkOverride for editor camera', () => {
      const { handle } = createWithMockedOnBeforeRender()
      const editorR = handle.editorRenderer!

      const previousOverride = makeMockSparkRenderer()
      SparkRenderer.sparkOverride = previousOverride

      const editorCamera = new THREE.PerspectiveCamera()
      editorCamera.userData.editorCamera = true

      editorR.onBeforeRender(renderer, scene, editorCamera)
      expect(SparkRenderer.sparkOverride).toBe(previousOverride)
    })

    it('preserves pre-existing sparkOverride for real camera', () => {
      let observedOverride: SparkRenderer | undefined
      const mockFn = vi.fn(() => {
        observedOverride = SparkRenderer.sparkOverride
      })
      const { handle } = createWithMockedOnBeforeRender(mockFn)
      const editorR = handle.editorRenderer!
      const realR = handle.realRenderer!

      const previousOverride = makeMockSparkRenderer()
      SparkRenderer.sparkOverride = previousOverride

      const realCamera = new THREE.PerspectiveCamera()
      realCamera.userData.editorCamera = false

      editorR.onBeforeRender(renderer, scene, realCamera)

      // Inside callback, override is realRenderer (not the previous one)
      expect(observedOverride).toBe(realR)
      // After the call, previous override is restored
      expect(SparkRenderer.sparkOverride).toBe(previousOverride)
    })

    it('restores sparkOverride when onBeforeRender throws (editor camera)', () => {
      const mockFn = vi.fn(() => { throw new Error('render crash') })
      const { handle } = createWithMockedOnBeforeRender(mockFn)
      const editorR = handle.editorRenderer!

      const previousOverride = makeMockSparkRenderer()
      SparkRenderer.sparkOverride = previousOverride

      const editorCamera = new THREE.PerspectiveCamera()
      editorCamera.userData.editorCamera = true

      expect(() => editorR.onBeforeRender(renderer, scene, editorCamera)).toThrow('render crash')
      expect(SparkRenderer.sparkOverride).toBe(previousOverride)
    })

    it('restores sparkOverride when onBeforeRender throws (real camera)', () => {
      const mockFn = vi.fn(() => { throw new Error('render crash') })
      const { handle } = createWithMockedOnBeforeRender(mockFn)
      const editorR = handle.editorRenderer!

      const previousOverride = makeMockSparkRenderer()
      SparkRenderer.sparkOverride = previousOverride

      const realCamera = new THREE.PerspectiveCamera()
      realCamera.userData.editorCamera = false

      expect(() => editorR.onBeforeRender(renderer, scene, realCamera)).toThrow('render crash')
      expect(SparkRenderer.sparkOverride).toBe(previousOverride)
    })
  })

  describe('disposal', () => {
    it('disposes both Spark renderers', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)

      const editorDispose = vi.fn()
      const realDispose = vi.fn()
      handle.editorRenderer!.dispose = editorDispose
      handle.realRenderer!.dispose = realDispose

      handle.dispose()

      expect(editorDispose).toHaveBeenCalledTimes(1)
      expect(realDispose).toHaveBeenCalledTimes(1)
    })

    it('removes editor renderer from scene on dispose', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)

      const editorRef = handle.editorRenderer!
      handle.dispose()

      expect(scene.remove).toHaveBeenCalledWith(editorRef)
    })

    it('is safe to call dispose multiple times', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)

      const editorDispose = vi.fn()
      const realDispose = vi.fn()
      handle.editorRenderer!.dispose = editorDispose
      handle.realRenderer!.dispose = realDispose

      handle.dispose()
      handle.dispose()
      handle.dispose()

      expect(editorDispose).toHaveBeenCalledTimes(1)
      expect(realDispose).toHaveBeenCalledTimes(1)
    })

    it('nulls exposed references after dispose', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      handle.dispose()

      expect(handle.editorRenderer).toBeNull()
      expect(handle.realRenderer).toBeNull()
    })

    it('attach after dispose is a no-op', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      handle.attach(scene)
      handle.dispose()

      const newScene = makeMockScene()
      handle.attach(newScene)

      expect(newScene.add).not.toHaveBeenCalled()
      expect(handle.editorRenderer).toBeNull()
    })
  })

  describe('type contract', () => {
    it('returns a handle with the expected shape', () => {
      const handle = createSparkStudioRenderer(baseOptions)
      expect(typeof handle.attach).toBe('function')
      expect(typeof handle.dispose).toBe('function')
      expect(handle.editorRenderer).toBeNull()
      expect(handle.realRenderer).toBeNull()
    })
  })
})
