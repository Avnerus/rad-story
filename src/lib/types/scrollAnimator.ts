/**
 * Branded ScrollAnimator type guard (HMR-safe structural check).
 *
 * Exports a reusable `isScrollAnimator` type guard that narrows to a
 * structural interface so consumers don't need to import the concrete
 * ScrollAnimator class (avoids coupling / HMR issues).
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
 * HMR-safe type guard: check if an object is a branded ScrollAnimator.
 * Narrows to `ScrollAnimatorLike` on success.
 */
export function isScrollAnimator(obj: unknown): obj is ScrollAnimatorLike {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'isScrollAnimator' in obj &&
    (obj as Record<string, unknown>).isScrollAnimator === true &&
    typeof (obj as Record<string, unknown>).applyScrollPercentage === 'function'
  )
}
