<script lang="ts">
  import { T } from '@threlte/core'
  import { untrack } from 'svelte'
  import type { DeviceProfile } from '$lib/types'
  import { createSceneObjects } from '$lib/scenes/sceneObjects'
  import SceneRuntime from './SceneRuntime.svelte'

  interface Props {
    url: string
    profile: DeviceProfile
    onReady?: () => void
  }

  let { url, profile, onReady }: Props = $props()

  // untrack() explicitly captures the initial profile value — scene objects
  // are created once at startup and profile is immutable after that
  const { camera, cameraTarget, cameraAnimator, targetAnimator, sparkControls, splatWrapper } =
    createSceneObjects(untrack(() => profile))
</script>

<SceneRuntime
  {url}
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

  <T is={sparkControls} name="Spark" />

  <T is={splatWrapper} name="SplatWrapper" />
</SceneRuntime>
