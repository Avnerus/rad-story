<script lang="ts">
  import { T } from '@threlte/core'
  import { untrack } from 'svelte'
  import type { DeviceProfile } from '$lib/types'
  import { detectProfileName } from '$lib/spark/deviceProfile'
  import { createSceneObjects, DEFAULT_PROFILE_SETTINGS, type ProfileSettings } from './sceneObjects'
  import SceneRuntime from '$lib/components/SceneRuntime.svelte'

  interface Props {
    profile: DeviceProfile
    onReady?: () => void
  }

  let { profile, onReady }: Props = $props()

  const RAD_URL = 'https://avner.us/baby_yoda-lod.rad'

  // Scene-local profile overrides — persisted via source sync on the <T> attribute.
  // Both `desktop` and `mobile` parent keys must always be present.
  // Child objects contain only fields that differ from the global baseline.
  let profileSettings: ProfileSettings = $state({ ...DEFAULT_PROFILE_SETTINGS })

  // untrack() explicitly captures the initial profile value — scene objects
  // are created once at startup and profile is immutable after that
  const { camera, cameraTarget, cameraAnimator, targetAnimator, sparkControls, splatWrapper } =
    createSceneObjects(
      untrack(() => profile),
      detectProfileName(),
      untrack(() => profileSettings),
    )
</script>

<SceneRuntime
  url={RAD_URL}
  {profile}
  {onReady}
  {sparkControls}
  {splatWrapper}
  appCamera={camera}
  {cameraTarget}
  profileSettings={profileSettings}
  onProfileSettingsChange={(newSettings) => { profileSettings = newSettings }}
>
  <T
    is={cameraAnimator}
    name="Camera ScrollAnimator"
    keyframes={[
      { scroll: 0, position: [0, 0, -1], rotation: [0, 0, 0] },
      { scroll: 100, position: [0, 30, -1], rotation: [0, 0, 0] },
    ]}
    showChildCameraFrustumWhenSelected
  >
    <T is={camera} name="PerspectiveCamera" makeDefault />
  </T>

  <T
    is={targetAnimator}
    name="Camera Target ScrollAnimator"
    keyframes={[
      { scroll: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
    ]}
  >
    <T is={cameraTarget} name="CameraTarget" />
  </T>

  <T is={sparkControls} name="Spark" profileSettings={profileSettings} />

  <T is={splatWrapper} name="SplatWrapper" position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]} />
</SceneRuntime>
