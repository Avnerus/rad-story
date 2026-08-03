/**
 * Shared typed test helpers for Spark/Three.js mocks.
 *
 * Interfaces declare only the members consumed by the unit under test.
 * They do NOT extend the full Three/Spark classes.
 *
 * The SparkRenderer constructor requires a concrete THREE.WebGLRenderer
 * (needing a real GPU context unavailable in jsdom). The adapter
 * `asWebGLRendererForSparkTest()` bridges this single third-party boundary
 * with one localized assertion. All other test fixtures use real instances.
 */
import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import { vi } from 'vitest'

/** Minimal WebGLRenderer shape consumed by SparkRenderer construction. */
export interface MockWebGLRenderer {
  render: ReturnType<typeof vi.fn>
  domElement: HTMLCanvasElement
  setSize: ReturnType<typeof vi.fn>
  setPixelRatio: ReturnType<typeof vi.fn>
  setClearColor: ReturnType<typeof vi.fn>
  setScissorTest: ReturnType<typeof vi.fn>
  setScissor: ReturnType<typeof vi.fn>
  setViewport: ReturnType<typeof vi.fn>
  getDrawingBufferSize: ReturnType<typeof vi.fn>
  info: { render: { frame: number } }
  capabilities: { maxTextureSize: number }
  xr: { isPresenting: boolean }
  setDirty?: ReturnType<typeof vi.fn>
}

/**
 * Build a WebGLRenderer mock with only the members the tests consume.
 * Returns the narrow MockWebGLRenderer type — not a full class.
 */
export function createMockRenderer(): MockWebGLRenderer {
  return {
    render: vi.fn(),
    domElement: document.createElement('canvas'),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    setScissorTest: vi.fn(),
    setScissor: vi.fn(),
    setViewport: vi.fn(),
    getDrawingBufferSize: vi.fn(() => new THREE.Vector2(800, 600)),
    info: { render: { frame: 0 } },
    capabilities: { maxTextureSize: 4096 },
    xr: { isPresenting: false },
  }
}

/**
 * Adapter: present a MockWebGLRenderer as THREE.WebGLRenderer for Spark.
 *
 * SparkRendererOptions.renderer requires a real THREE.WebGLRenderer which
 * needs a GPU context (unavailable in jsdom). This single assertion bridges
 * that third-party boundary. The mock satisfies all members SparkRenderer
 * reads during construction and the test exercises.
 */
export function asWebGLRendererForSparkTest(mock: MockWebGLRenderer): THREE.WebGLRenderer {
  return mock as unknown as THREE.WebGLRenderer
}

/**
 * Convenience: build a mock renderer ready for SparkRendererOptions.
 * Internally uses asWebGLRendererForSparkTest() for the single assertion.
 */
export function makeMockRenderer(): THREE.WebGLRenderer {
  return asWebGLRendererForSparkTest(createMockRenderer())
}

/**
 * Build a mock Scene using a real THREE.Scene with spied methods.
 * Returns the real Scene — no asserted intersection.
 */
export function makeMockScene(): THREE.Scene {
  const scene = new THREE.Scene()
  const origAdd = scene.add.bind(scene)
  scene.add = vi.fn().mockImplementation(origAdd)
  const origRemove = scene.remove.bind(scene)
  scene.remove = vi.fn().mockImplementation(origRemove)
  return scene
}

/**
 * Build a mock SparkRenderer for sparkOverride identity tests.
 * Uses a real SparkRenderer so identity checks work correctly.
 */
export function makeMockSparkRenderer(): SparkRenderer {
  return new SparkRenderer({
    renderer: makeMockRenderer(),
  })
}
