/**
 * Shared typed test helpers for Spark/Three.js mocks.
 *
 * Each factory returns a mock typed through a narrow structural interface
 * that describes exactly what the unit under test consumes.
 */
import * as THREE from 'three'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { vi } from 'vitest'

/** Minimal WebGLRenderer shape consumed by SparkRenderer construction. */
export interface MockWebGLRenderer extends THREE.WebGLRenderer {
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
export interface MockScene extends THREE.Scene {
  add: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  children: object[]
}

/** Mock SplatMesh for use as a Map key in lodInstances tests. */
export type MockSplatMesh = SplatMesh

/** Mock SparkRenderer for sparkOverride identity tests. */
export type MockSparkRenderer = SparkRenderer

/** Build a mock WebGLRenderer with only the members the tests consume. */
export function makeMockRenderer(): MockWebGLRenderer {
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
  } as MockWebGLRenderer
}

/** Build a mock Scene with only the members the tests consume. */
export function makeMockScene(): MockScene {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    children: [],
  } as MockScene
}

/** Build a mock SplatMesh for use as a Map key in lodInstances tests. */
export function makeMockSplatMesh(): MockSplatMesh {
  return {} as MockSplatMesh
}

/** Build a mock SparkRenderer for sparkOverride identity tests. */
export function makeMockSparkRenderer(): MockSparkRenderer {
  return {} as MockSparkRenderer
}
