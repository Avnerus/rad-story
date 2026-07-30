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

  const { camera, cameraTarget, cameraAnimator, targetAnimator, sparkControls } =
    createSceneObjects(profile, { showFrustum: true })

  // Debug state pushed from SceneRuntime via callback
  let debugState = $state({
    progress: 0,
    cameraX: 0, cameraY: 0, cameraZ: 0,
    targetX: 0, targetY: 0, targetZ: 0,
    cameraActive: false,
    loaded: false,
  })

  function handleDebugState(state: typeof debugState): void {
    debugState = { ...state }
  }

  function handleReady(): void {
    onReady?.()
  }
</script>

<SceneRuntime url={RAD_URL} {profile} onReady={handleReady} {sparkControls} onDebugState={handleDebugState}>
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
</SceneRuntime>

<!-- Visually hidden debug element for e2e tests (outside Canvas) -->
<div
  class="camera-debug"
  data-testid="camera-state"
  data-progress={debugState.progress.toFixed(3)}
  data-x={debugState.cameraX.toFixed(3)}
  data-y={debugState.cameraY.toFixed(3)}
  data-z={debugState.cameraZ.toFixed(3)}
  data-target-x={debugState.targetX.toFixed(3)}
  data-target-y={debugState.targetY.toFixed(3)}
  data-target-z={debugState.targetZ.toFixed(3)}
  data-active={debugState.cameraActive}
  aria-hidden="true"
></div>

{#if !debugState.loaded}
  <div class="scroll-hint">Scroll to change view</div>
{/if}
