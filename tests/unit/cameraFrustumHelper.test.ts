import { describe, it, expect } from 'vitest'
import { Object3D, PerspectiveCamera, CameraHelper } from 'three'

/**
 * Unit tests for the CameraFrustumHelper exact-one camera contract.
 *
 * These tests verify the descendant camera resolution logic in isolation,
 * without depending on the Svelte component or Studio integration.
 */

/**
 * Resolve all descendant PerspectiveCamera objects in an Object3D hierarchy.
 * Mirrors the logic in CameraFrustumHelper.svelte.
 */
function findAllDescendantCameras(obj: Object3D): PerspectiveCamera[] {
  const results: PerspectiveCamera[] = []
  obj.traverse((child) => {
    if (child.type === 'PerspectiveCamera') {
      results.push(child as PerspectiveCamera)
    }
  })
  return results
}

describe('CameraFrustumHelper exact-one camera resolution', () => {
  it('returns empty array when no descendant cameras', () => {
    const parent = new Object3D()
    parent.add(new Object3D())
    parent.add(new Object3D())
    const cameras = findAllDescendantCameras(parent)
    expect(cameras).toHaveLength(0)
  })

  it('returns exactly one camera when there is a single descendant', () => {
    const parent = new Object3D()
    const cam = new PerspectiveCamera()
    parent.add(cam)
    const cameras = findAllDescendantCameras(parent)
    expect(cameras).toHaveLength(1)
    expect(cameras[0]).toBe(cam)
  })

  it('returns exactly one camera for deeply nested single descendant', () => {
    const parent = new Object3D()
    const nested = new Object3D()
    const cam = new PerspectiveCamera()
    nested.add(cam)
    parent.add(nested)
    const cameras = findAllDescendantCameras(parent)
    expect(cameras).toHaveLength(1)
    expect(cameras[0]).toBe(cam)
  })

  it('returns multiple cameras when there are two descendants', () => {
    const parent = new Object3D()
    const cam1 = new PerspectiveCamera()
    const cam2 = new PerspectiveCamera()
    parent.add(cam1)
    parent.add(cam2)
    const cameras = findAllDescendantCameras(parent)
    expect(cameras).toHaveLength(2)
    expect(cameras).toContain(cam1)
    expect(cameras).toContain(cam2)
  })

  it('returns multiple cameras for mixed nesting', () => {
    const parent = new Object3D()
    const cam1 = new PerspectiveCamera()
    const nested = new Object3D()
    const cam2 = new PerspectiveCamera()
    nested.add(cam2)
    parent.add(cam1)
    parent.add(nested)
    const cameras = findAllDescendantCameras(parent)
    expect(cameras).toHaveLength(2)
  })

  it('exact-one contract: zero cameras → no helper', () => {
    const parent = new Object3D()
    const cameras = findAllDescendantCameras(parent)
    // Helper is only created when cameras.length === 1
    const wouldCreateHelper = cameras.length === 1
    expect(wouldCreateHelper).toBe(false)
  })

  it('exact-one contract: one camera → helper created', () => {
    const parent = new Object3D()
    const cam = new PerspectiveCamera()
    parent.add(cam)
    const cameras = findAllDescendantCameras(parent)
    const wouldCreateHelper = cameras.length === 1
    expect(wouldCreateHelper).toBe(true)
    expect(cameras[0]).toBe(cam)
  })

  it('exact-one contract: two cameras → no helper', () => {
    const parent = new Object3D()
    parent.add(new PerspectiveCamera())
    parent.add(new PerspectiveCamera())
    const cameras = findAllDescendantCameras(parent)
    const wouldCreateHelper = cameras.length === 1
    expect(wouldCreateHelper).toBe(false)
  })
})

describe('CameraHelper disposal', () => {
  it('CameraHelper geometry and materials can be disposed', () => {
    const cam = new PerspectiveCamera()
    const helper = new CameraHelper(cam)
    // CameraHelper creates LineSegments with LineBasicMaterial
    expect(helper.geometry).toBeDefined()
    expect(helper.material).toBeDefined()

    helper.geometry.dispose()
    helper.traverse((obj) => {
      if ('material' in obj && obj.material) {
        const mat = obj.material as { dispose?: () => void }
        if (typeof mat.dispose === 'function') mat.dispose()
      }
    })
  })
})
