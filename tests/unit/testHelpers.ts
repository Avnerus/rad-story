/**
 * Shared typed test helpers for Spark/Three.js mocks.
 *
 * Interfaces declare only the members consumed by the unit under test.
 * They do NOT extend the full Three/Spark classes.
 *
 * WebGLRenderer and Scene mocks use real Three.js instances with spied
 * methods where practical. For SparkRendererOptions which requires a
 * concrete THREE.WebGLRenderer (needing a real GPU context unavailable
 * in unit tests), a single adapter bridges the third-party boundary.
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

/** Minimal Scene shape consumed by SparkStudioRendererHandle.attach(). */
export interface MockScene {
  add: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  children: object[]
}

/**
 * Build a WebGLRenderer mock.
 *
 * SparkRendererOptions requires THREE.WebGLRenderer which needs a real
 * GPU context (unavailable in jsdom unit tests). This adapter constructs
 * a plain object satisfying the MockWebGLRenderer interface and presents
 * it as the required type at this single third-party boundary.
 */
export function makeMockRenderer(): MockWebGLRenderer & THREE.WebGLRenderer {
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
  } as MockWebGLRenderer & THREE.WebGLRenderer
}

/**
 * Build a mock Scene using a real THREE.Scene with spied methods.
 */
export function makeMockScene(): MockScene & THREE.Scene {
  const scene = new THREE.Scene()
  const origAdd = scene.add.bind(scene)
  scene.add = vi.fn().mockImplementation(origAdd)
  const origRemove = scene.remove.bind(scene)
  scene.remove = vi.fn().mockImplementation(origRemove)
  return scene as MockScene & THREE.Scene
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
