/**
 * ScrollAnimator — a Three.js Object3D subclass that holds scroll-keyframed
 * position/rotation data and applies sampled transforms at a given percentage.
 *
 * Keyframes are stored as plain data arrays for source serialization.
 * The `keyframes` setter owns canonical deep copies.
 */
import { Object3D } from 'three'
import type { ScrollKeyframe } from './scrollAnimation'
import { canonicalizeKeyframes, sampleKeyframes } from './scrollAnimation'

export class ScrollAnimator extends Object3D {
  /** HMR-safe brand for runtime detection. */
  declare isScrollAnimator: boolean
  override type: string = 'ScrollAnimator'

  private _keyframes: ScrollKeyframe[]

  /**
   * When true, selecting this ScrollAnimator in Studio shows a CameraHelper
   * for the first descendant PerspectiveCamera. This is a source-syncable
   * property so Studio can persist it into the scene file.
   */
  showChildCameraFrustumWhenSelected: boolean = false

  constructor() {
    super()
    this.isScrollAnimator = true
    this.type = 'ScrollAnimator'
    this._keyframes = []
  }

  /**
   * Get a deep copy of the current keyframes.
   */
  get keyframes(): ScrollKeyframe[] {
    return canonicalizeKeyframes(this._keyframes)
  }

  /**
   * Set keyframes from a plain array. Owns canonical deep copies.
   */
  set keyframes(value: ScrollKeyframe[]) {
    this._keyframes = canonicalizeKeyframes(value)
  }

  /**
   * Sample the current keyframes at the given percentage and apply the
   * result as local position and quaternion. Does nothing when no keyframes
   * exist (zero-frame case).
   */
  applyScrollPercentage(percent: number): void {
    const result = sampleKeyframes(this._keyframes, percent)
    if (!result) return

    this.position.copy(result.position)
    this.quaternion.copy(result.quaternion)
  }
}
