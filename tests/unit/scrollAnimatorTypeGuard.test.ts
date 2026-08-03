import { describe, it, expect } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
import { isScrollAnimator } from '$lib/types/scrollAnimator'
import type { ScrollAnimatorLike } from '$lib/types/scrollAnimator'

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
    expect(isScrollAnimator({ isScrollAnimator: true })).toBe(false) // missing applyScrollPercentage
  })

  it('returns true for structurally matching objects (HMR-safe)', () => {
    const fake = {
      isScrollAnimator: true,
      applyScrollPercentage: () => {},
    }
    expect(isScrollAnimator(fake)).toBe(true)
  })

  it('narrows type to ScrollAnimatorLike after guard', () => {
    const obj: unknown = {
      isScrollAnimator: true,
      applyScrollPercentage: () => {},
      keyframes: [],
    }
    if (isScrollAnimator(obj)) {
      // Should compile: obj is narrowed to ScrollAnimatorLike
      const kfs: unknown[] = obj.keyframes
      expect(kfs).toEqual([])
    }
  })

  it('narrowed ScrollAnimatorLike has correct shape', () => {
    const animator: ScrollAnimatorLike = {
      isScrollAnimator: true,
      applyScrollPercentage: () => {},
      keyframes: [],
      position: { x: 0, y: 0, z: 0 } as any,
      quaternion: { x: 0, y: 0, z: 0, w: 1 } as any,
      rotation: { x: 0, y: 0, z: 0 } as any,
      scale: { x: 1, y: 1, z: 1 } as any,
    } as ScrollAnimatorLike

    expect(animator.isScrollAnimator).toBe(true)
    expect(Array.isArray(animator.keyframes)).toBe(true)
    expect(typeof animator.applyScrollPercentage).toBe('function')
  })
})
