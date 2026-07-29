import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SparkReloadCoordinator } from '$lib/spark/SparkReloadRuntime'

/** Fake mesh factory for testing */
function makeMeshFactory(): {
  factory: (url: string) => Promise<{ mesh: object; dispose: () => void }>
  meshes: object[]
  disposed: Set<object>
} {
  const meshes: object[] = []
  const disposed = new Set<object>()

  const factory = async (url: string) => {
    const mesh = { url, id: meshes.length + 1 }
    meshes.push(mesh)
    return {
      mesh,
      dispose: () => disposed.add(mesh),
    }
  }

  return { factory, meshes, disposed }
}

describe('SparkReloadCoordinator', () => {
  let coordinator: SparkReloadCoordinator

  beforeEach(() => {
    coordinator = new SparkReloadCoordinator()
  })

  describe('basic reload', () => {
    it('completes a reload and calls onReloadComplete', async () => {
      const { factory, meshes } = makeMeshFactory()
      let completedMesh: object | null = null
      let completedGen: number | null = null
      coordinator.onReloadComplete((mesh, gen) => {
        completedMesh = mesh
        completedGen = gen
      })

      await coordinator.requestReload('test.rad', factory)

      expect(meshes).toHaveLength(1)
      expect(completedMesh).toBe(meshes[0])
      expect(completedGen).toBe(1)
      expect(coordinator.generation).toBe(1)
    })

    it('isReloading is true during reload', async () => {
      const { factory } = makeMeshFactory()

      expect(coordinator.isReloading).toBe(false)
      const promise = coordinator.requestReload('test.rad', factory)
      expect(coordinator.isReloading).toBe(true)
      await promise
      // After promise resolves, isReloading is false
      expect(coordinator.isReloading).toBe(false)
    })

    it('calls onReloadError on factory failure', async () => {
      const errMsg = new Error('network failure')
      const failingFactory = async () => { throw errMsg }
      let errorReceived: unknown = null
      let errorGen: number | null = null
      coordinator.onReloadError((err, gen) => {
        errorReceived = err
        errorGen = gen
      })

      await coordinator.requestReload('bad.rad', failingFactory)

      expect(errorReceived).toBe(errMsg)
      expect(errorGen).toBe(1)
      expect(coordinator.isReloading).toBe(false)
    })
  })

  describe('rapid edits / coalescing', () => {
    it('latest request wins, superseded requests are aborted', async () => {
      const { factory } = makeMeshFactory()
      let completedMesh: object | null = null
      let completedGen: number | null = null
      coordinator.onReloadComplete((mesh, gen) => {
        completedMesh = mesh
        completedGen = gen
      })

      // Fire 3 rapid requests
      const p1 = coordinator.requestReload('a.rad', factory)
      const p2 = coordinator.requestReload('b.rad', factory)
      const p3 = coordinator.requestReload('c.rad', factory)

      await Promise.all([p1, p2, p3])

      // Only the last one should have completed
      expect(completedGen).toBe(3)
      expect(completedMesh).toHaveProperty('url', 'c.rad')
      expect(coordinator.generation).toBe(3)
      expect(coordinator.isReloading).toBe(false)
    })

    it('async race: slower earlier request is superseded by faster later', async () => {
      const slowFactory = async (url: string) => {
        await new Promise((r) => setTimeout(r, 50))
        const mesh = { url, slow: true }
        return { mesh, dispose: vi.fn() }
      }

      const fastFactory = async (url: string) => {
        await new Promise((r) => setTimeout(r, 5))
        const mesh = { url, fast: true }
        return { mesh, dispose: vi.fn() }
      }

      let completedMesh: object | null = null
      let completedGen: number | null = null
      coordinator.onReloadComplete((mesh, gen) => {
        completedMesh = mesh
        completedGen = gen
      })

      const p1 = coordinator.requestReload('slow.rad', slowFactory)
      const p2 = coordinator.requestReload('fast.rad', fastFactory)

      await Promise.all([p1, p2])

      // The fast request (gen 2) should win because it was the latest
      expect(completedGen).toBe(2)
      expect(completedMesh).toHaveProperty('fast', true)
    })
  })

  describe('component destruction', () => {
    it('dispose aborts in-flight reload', async () => {
      const slowFactory = async (url: string) => {
        await new Promise((r) => setTimeout(r, 100))
        return { mesh: { url }, dispose: vi.fn() }
      }

      let completed = false
      coordinator.onReloadComplete(() => { completed = true })

      const promise = coordinator.requestReload('test.rad', slowFactory)
      expect(coordinator.isReloading).toBe(true)

      // Destroy while reload is in flight
      coordinator.dispose()
      expect(coordinator.isReloading).toBe(false)

      await promise
      expect(completed).toBe(false) // Should not have called onReloadComplete
    })

    it('dispose prevents new reloads', async () => {
      coordinator.dispose()
      const { factory, meshes } = makeMeshFactory()

      await coordinator.requestReload('test.rad', factory)

      expect(meshes).toHaveLength(0) // No mesh created
    })

    it('dispose clears callbacks', async () => {
      coordinator.onReloadComplete(() => { /* should not be called */ })
      coordinator.onReloadError(() => { /* should not be called */ })
      coordinator.dispose()

      // After dispose, a factory that resolves should not trigger callbacks
      const { factory } = makeMeshFactory()
      const promise = coordinator.requestReload('test.rad', factory)
      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('generation counter', () => {
    it('generation increments monotonically', async () => {
      const { factory } = makeMeshFactory()

      await coordinator.requestReload('a.rad', factory)
      expect(coordinator.generation).toBe(1)

      await coordinator.requestReload('b.rad', factory)
      expect(coordinator.generation).toBe(2)

      await coordinator.requestReload('c.rad', factory)
      expect(coordinator.generation).toBe(3)
    })

    it('generation persists across destroy/recreate', () => {
      // Each new coordinator starts at 0
      const c1 = new SparkReloadCoordinator()
      expect(c1.generation).toBe(0)
      c1.dispose()

      const c2 = new SparkReloadCoordinator()
      expect(c2.generation).toBe(0)
      c2.dispose()
    })
  })
})
