<script lang="ts">
  import { T } from '@threlte/core'
  import type { DeviceProfile } from '$lib/types'
  import { createSceneObjects } from './sceneObjects'
  import SceneRuntime from '$lib/components/SceneRuntime.svelte'

  interface Props {
    profile: DeviceProfile
    onReady?: () => void
  }

  let { profile, onReady }: Props = $props()

  const RAD_URL = 'https://avner.us/baby_yoda-lod.rad'

  const { camera, cameraTarget, cameraAnimator, targetAnimator, sparkControls, splatWrapper } =
    createSceneObjects(profile)
</script>

<SceneRuntime
  url={RAD_URL}
  {profile}
  {onReady}
  {sparkControls}
  {splatWrapper}
  appCamera={camera}
  {cameraTarget}
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

  <T is={sparkControls} name="Spark" settings={sparkControls.settings} />

  <T is={splatWrapper} name="SplatWrapper" />
</SceneRuntime>
