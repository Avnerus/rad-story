/**
 * Branded ScrollAnimator type guard (HMR-safe structural check).
 *
 * Exports a reusable `isScrollAnimator` type guard that narrows to a
 * structural interface so consumers don't need to import the concrete
 * ScrollAnimator class (avoids coupling / HMR issues).
 *
 * The guard accepts `Object3D` because all callers (scene.traverse,
 * Studio selection) already supply an Object3D. It validates the brand
 * flag, the callable method, and the `keyframes` property — everything
 * promised by `ScrollAnimatorLike`.
 */

import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'
import type { Object3D } from 'three'

/**
 * Minimal structural interface for a ScrollAnimator.
 * Used by type guards and consumers that need to access keyframes
 * and applyScrollPercentage without importing the concrete class.
 */
export interface ScrollAnimatorLike extends Object3D {
  isScrollAnimator: true
  keyframes: ScrollKeyframe[]
  applyScrollPercentage(percent: number): void
  showChildCameraFrustumWhenSelected?: boolean
}

/**
 * HMR-safe type guard: check if an Object3D is a branded ScrollAnimator.
 * Narrows to `ScrollAnimatorLike` on success.
 *
 * Validates: brand flag === true, applyScrollPercentage is callable,
 * and keyframes property exists and is an array.
 *
 * The parameter type is `Object3D` because all callers (scene.traverse,
 * Studio selection) already supply an Object3D. This ensures the guard
 * only narrows values that are genuinely Object3D instances.
 */
export function isScrollAnimator(obj: Object3D): obj is ScrollAnimatorLike {
  const candidate = obj as Record<string, unknown>
  return (
    candidate.isScrollAnimator === true &&
    typeof candidate.applyScrollPercentage === 'function' &&
    Array.isArray(candidate.keyframes)
  )
}
