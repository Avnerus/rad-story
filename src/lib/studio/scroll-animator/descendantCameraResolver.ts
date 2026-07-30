import { Object3D, PerspectiveCamera } from 'three'

/**
 * Resolve all descendant PerspectiveCamera objects in an Object3D hierarchy.
 *
 * Used by CameraFrustumHelper to enforce the exact-one-camera contract:
 * a helper is created only when exactly one descendant camera exists.
 *
 * @param obj - Root of the hierarchy to search.
 * @returns Array of all PerspectiveCamera descendants (may be empty).
 */
export function findAllDescendantCameras(obj: Object3D): PerspectiveCamera[] {
  const results: PerspectiveCamera[] = []
  obj.traverse((child) => {
    if (child.type === 'PerspectiveCamera') {
      results.push(child as PerspectiveCamera)
    }
  })
  return results
}
