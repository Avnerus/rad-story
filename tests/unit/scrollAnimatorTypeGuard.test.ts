import { describe, it, expect } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'
import { isScrollAnimator } from '$lib/types/scrollAnimator'
import type { ScrollAnimatorLike } from '$lib/types/scrollAnimator'

/**
 * Build a minimal HMR-safe ScrollAnimator stand-in by extending Object3D
 * and adding the branded domain properties through a typed factory.
 */
function makeFakeScrollAnimator(): ScrollAnimatorLike {
  const obj = new Object3D()
  Object.defineProperty(obj, 'isScrollAnimator', { value: true })
  Object.defineProperty(obj, 'keyframes', { value: [] as ScrollKeyframe[] })
  Object.defineProperty(obj, 'applyScrollPercentage', {
    value: (_p: number) => { obj.position.set(_p, _p, _p) },
  })
  return obj as ScrollAnimatorLike
}

describe('isScrollAnimator type guard', () => {
  it('returns true for a real ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    expect(isScrollAnimator(animator)).toBe(true)
  })

  it('returns false for plain Object3D', () => {
    expect(isScrollAnimator(new Object3D())).toBe(false)
  })

  it('returns false for PerspectiveCamera', () => {
    expect(isScrollAnimator(new PerspectiveCamera())).toBe(false)
  })

  it('returns false for null', () => {
    expect(isScrollAnimator(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isScrollAnimator(undefined)).toBe(false)
  })

  it('returns false for plain objects', () => {
    expect(isScrollAnimator({})).toBe(false)
    expect(isScrollAnimator({ isScrollAnimator: true } as object)).toBe(false) // missing uuid (not Object3D)
  })

  it('returns false for branded object missing keyframes array', () => {
    expect(isScrollAnimator({
      uuid: 'test',
      isScrollAnimator: true,
      applyScrollPercentage: () => {},
      // keyframes missing or not an array
    } as object)).toBe(false)
  })

  it('returns false for branded object with non-array keyframes', () => {
    expect(isScrollAnimator({
      uuid: 'test',
      isScrollAnimator: true,
      applyScrollPercentage: () => {},
      keyframes: 'not-an-array',
    } as object)).toBe(false)
  })

  it('returns true for structurally matching Object3D (HMR-safe)', () => {
    const fake = makeFakeScrollAnimator()
    expect(isScrollAnimator(fake)).toBe(true)
  })

  it('narrows type to ScrollAnimatorLike after guard', () => {
    const obj: unknown = makeFakeScrollAnimator()
    if (isScrollAnimator(obj)) {
      // Should compile: obj is narrowed to ScrollAnimatorLike
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
      // Object3D properties accessible
      expect(animator.uuid).toBeDefined()
    }
  })

  it('malformed branded object: keyframes not array returns false', () => {
    const obj = new Object3D()
    Object.defineProperty(obj, 'isScrollAnimator', { value: true })
    Object.defineProperty(obj, 'applyScrollPercentage', { value: () => {} })
    Object.defineProperty(obj, 'keyframes', { value: 'not-array' })
    expect(isScrollAnimator(obj)).toBe(false)
  })

  it('malformed branded object: applyScrollPercentage not function returns false', () => {
    const obj = new Object3D()
    Object.defineProperty(obj, 'isScrollAnimator', { value: true })
    Object.defineProperty(obj, 'keyframes', { value: [] })
    Object.defineProperty(obj, 'applyScrollPercentage', { value: 'not-function' })
    expect(isScrollAnimator(obj)).toBe(false)
  })
})
