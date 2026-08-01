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
import { SparkControls, DEFAULT_PROFILE_SETTINGS, type ProfileSettings } from '$lib/spark/SparkControls'
import type { DeviceProfile, DeviceProfileName } from '$lib/types'
import { getGlobalBaseline } from '$lib/spark/deviceProfile'

/**
 * Re-export ProfileSettings and DEFAULT_PROFILE_SETTINGS from SparkControls
 * so scene files can import them from one place.
 */
export type { ProfileSettings }
export { DEFAULT_PROFILE_SETTINGS }

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
 * Create a standard set of scene objects for a scroll-based splat scene.
 *
 * Keyframes and frustum opt-in are authored ONLY in `<T>` attributes.
 * SparkControls is constructed with the detected profile name, scene
 * overrides, and the device profile baseline.
 *
 * @param profile - Device profile for initial renderer construction.
 * @param profileName - Active device profile name (from App.svelte).
 * @param profileSettings - Scene-local profile overrides (from scene literal).
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

  // Get the global baseline for the active profile
  const baseline = getGlobalBaseline(profileName)

  // SparkControls with profile name, overrides, and baseline
  const sparkControls = new SparkControls(undefined, profileName, profileSettings, baseline)

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
