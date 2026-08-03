import { describe, it, expect } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'
import { isScrollAnimator } from '$lib/types/scrollAnimator'
/**
 * HMR-safe ScrollAnimator stand-in: a real Object3D subclass with
 * the branded domain properties. Satisfies ScrollAnimatorLike without
 * any post-construction assertion.
 */
class FakeScrollAnimator extends Object3D {
  declare isScrollAnimator: boolean
  keyframes: ScrollKeyframe[] = []
  applyScrollPercentage(_p: number): void {
    this.position.set(_p, _p, _p)
  }
  constructor() {
    super()
    this.isScrollAnimator = true
  }
}

describe('isScrollAnimator type guard', () => {
  it('returns true for a real ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    expect(isScrollAnimator(animator)).toBe(true)
  })

  it('returns true for HMR-safe Object3D subclass (FakeScrollAnimator)', () => {
    const fake = new FakeScrollAnimator()
    expect(isScrollAnimator(fake)).toBe(true)
  })

  it('returns false for plain Object3D', () => {
    expect(isScrollAnimator(new Object3D())).toBe(false)
  })

  it('returns false for PerspectiveCamera', () => {
    expect(isScrollAnimator(new PerspectiveCamera())).toBe(false)
  })

  it('returns false for Object3D with brand but missing keyframes', () => {
    const obj = new Object3D()
    Object.defineProperty(obj, 'isScrollAnimator', { value: true })
    Object.defineProperty(obj, 'applyScrollPercentage', { value: () => {} })
    // keyframes missing
    expect(isScrollAnimator(obj)).toBe(false)
  })

  it('returns false for Object3D with non-array keyframes', () => {
    const obj = new Object3D()
    Object.defineProperty(obj, 'isScrollAnimator', { value: true })
    Object.defineProperty(obj, 'applyScrollPercentage', { value: () => {} })
    Object.defineProperty(obj, 'keyframes', { value: 'not-array' })
    expect(isScrollAnimator(obj)).toBe(false)
  })

  it('returns false for Object3D with non-function applyScrollPercentage', () => {
    const obj = new Object3D()
    Object.defineProperty(obj, 'isScrollAnimator', { value: true })
    Object.defineProperty(obj, 'keyframes', { value: [] })
    Object.defineProperty(obj, 'applyScrollPercentage', { value: 'not-function' })
    expect(isScrollAnimator(obj)).toBe(false)
  })

  it('narrows type to ScrollAnimatorLike after guard', () => {
    const obj: Object3D = new FakeScrollAnimator()
    if (isScrollAnimator(obj)) {
      // obj is narrowed to ScrollAnimatorLike
      const kfs: unknown[] = obj.keyframes
      expect(kfs).toEqual([])
    }
  })

  it('narrowed ScrollAnimatorLike has correct shape from real instance', () => {
    const animator = new ScrollAnimator()
    if (isScrollAnimator(animator)) {
      expect(animator.isScrollAnimator).toBe(true)
      expect(Array.isArray(animator.keyframes)).toBe(true)
      expect(typeof animator.applyScrollPercentage).toBe('function')
      expect(animator.uuid).toBeDefined()
    }
  })
})
