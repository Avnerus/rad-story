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
 *
 * For callers that have `unknown` (e.g. Studio transaction objects),
 * the guard first establishes the input is an Object3D-like value
 * before checking the ScrollAnimator-specific properties.
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
 * Overload 1: callers with `Object3D` (scene.traverse, Studio selection).
 * Overload 2: callers with `unknown` (Studio transaction objects).
 */
export function isScrollAnimator(obj: Object3D): obj is ScrollAnimatorLike
export function isScrollAnimator(obj: unknown): obj is ScrollAnimatorLike
export function isScrollAnimator(obj: unknown): obj is ScrollAnimatorLike {
  if (
    obj === null ||
    typeof obj !== 'object' ||
    !('uuid' in obj) // Object3D brand check
  ) {
    return false
  }
  const candidate = obj as Record<string, unknown>
  return (
    candidate.isScrollAnimator === true &&
    typeof candidate.applyScrollPercentage === 'function' &&
    Array.isArray(candidate.keyframes)
  )
}
