<script lang="ts">
  import { T } from '@threlte/core'
  import { untrack } from 'svelte'
  import type { DeviceProfile } from '$lib/types'
  import { createSceneObjects } from './sceneObjects'
  import SceneRuntime from '$lib/components/SceneRuntime.svelte'

  interface Props {
    profile: DeviceProfile
    onReady?: () => void
  }

  let { profile, onReady }: Props = $props()

  const RAD_URL = 'https://avner.us/baby_yoda-lod.rad'

  // untrack() explicitly captures the initial profile value — scene objects
  // are created once at startup and profile is immutable after that
  const { camera, cameraTarget, cameraAnimator, targetAnimator, sparkControls, splatWrapper } =
    createSceneObjects(untrack(() => profile))
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

  <T is={splatWrapper} name="SplatWrapper" position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]} />
</SceneRuntime>
