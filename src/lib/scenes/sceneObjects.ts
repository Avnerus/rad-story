/**
 * Reusable helpers for creating scene objects.
 *
 * Every scene file imports from here to create its camera, target,
 * ScrollAnimators, SparkControls, and SplatWrapper. The helpers produce
 * plain Three.js objects; the scene file declares them via literal `<T>`
 * nodes so that Studio source sync rewrites the scene file.
 *
 * Keyframes and settings are authored ONLY in the `<T>` attributes of the
 * scene file — never duplicated here. The constructors provide empty
 * defaults that are immediately overwritten by the `<T>` source-sync values.
 */

import { PerspectiveCamera, Object3D } from 'three'
import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
import { SparkControls } from '$lib/spark/SparkControls'
import type { DeviceProfile, DeviceProfileName } from '$lib/types'
import type { SparkSettings } from '$lib/spark/SparkControls'
import { computeEffectiveSettings } from '$lib/spark/deviceProfile'

/**
 * Objects created for a scene. The scene file passes these to literal
 * `<T>` nodes; the `<T>` attributes are the single source of truth
 * for keyframes, settings, and transforms.
 */
export interface SceneObjects {
  /** The app's PerspectiveCamera. */
  camera: PerspectiveCamera
  /** The CameraTarget Object3D that the camera always looks at. */
  cameraTarget: Object3D
  /** ScrollAnimator for the camera. Set keyframes via <T> attributes. */
  cameraAnimator: ScrollAnimator
  /** ScrollAnimator for the camera target. Set keyframes via <T> attributes. */
  targetAnimator: ScrollAnimator
  /** SparkControls for per-scene Spark settings. Set via <T> attributes. */
  sparkControls: SparkControls
  /** Stable wrapper Object3D for the SplatMesh. Declared via <T> in scene file. */
  splatWrapper: Object3D
}

/**
 * Scene-local profile overrides as persisted in the `<T>` attribute.
 * Both `desktop` and `mobile` parent keys must be present, even if empty.
 * Child objects contain only fields that differ from the global baseline.
 * Uses own-property presence (not truthiness) to distinguish "no override"
 * from valid falsey values like `false`, `0`, or `null`.
 */
export type ProfileSettings = {
  desktop: Record<string, SparkSettings[keyof SparkSettings]>
  mobile: Record<string, SparkSettings[keyof SparkSettings]>
}

/**
 * Default profile settings: empty overrides for both profiles.
 */
export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  desktop: {},
  mobile: {},
}

/**
 * Create a standard set of scene objects for a scroll-based splat scene.
 *
 * Keyframes, settings, and frustum opt-in are authored exclusively in the
 * `<T>` attributes of the scene file. This function creates empty defaults.
 *
 * @param profile - Device profile for SparkControls seed values (legacy, used only for initial renderer construction).
 * @param profileName - Active device profile name for computing effective settings from overrides.
 * @param profileSettings - Scene-local profile overrides from the `<T>` attribute.
 */
export function createSceneObjects(
  profile: DeviceProfile,
  profileName: DeviceProfileName = 'desktop',
  profileSettings: ProfileSettings = DEFAULT_PROFILE_SETTINGS,
): SceneObjects {
  const camera = new PerspectiveCamera(60, 1, 0.1, 10_000)

  const cameraTarget = new Object3D()
  cameraTarget.name = 'CameraTarget'

  const cameraAnimator = new ScrollAnimator()
  cameraAnimator.name = 'Camera ScrollAnimator'

  const targetAnimator = new ScrollAnimator()
  targetAnimator.name = 'Camera Target ScrollAnimator'

  // Compute effective settings: global baseline + scene overrides for active profile
  const effectiveSettings = computeEffectiveSettings(profileName, profileSettings)

  const sparkControls = new SparkControls(effectiveSettings)

  const splatWrapper = new Object3D()
  splatWrapper.name = 'SplatWrapper'

  return {
    camera,
    cameraTarget,
    cameraAnimator,
    targetAnimator,
    sparkControls,
    splatWrapper,
  }
}
