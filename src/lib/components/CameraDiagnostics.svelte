<script lang="ts">
  /**
   * Camera diagnostics component — only rendered in e2e stub builds.
   *
   * Provides a visually hidden `[data-testid="camera-state"]` element with
   * live camera/target world coordinates, scroll progress, and active-camera
   * status. All reactive state and frame tasks are encapsulated here so
   * production SceneRuntime has zero diagnostic overhead.
   *
   * Gated at compile time by `import.meta.env.VITE_E2E_STUB_SPARK === 'true'`
   * in the parent (SceneRuntime). This component is never instantiated in
   * production builds.
   */
  import { useThrelte, useTask } from '@threlte/core'
  import { Vector3 } from 'three'
  import type { PerspectiveCamera, Object3D } from 'three'
  import type { Writable } from 'svelte/store'

  interface Props {
    /** The app's PerspectiveCamera — used for look-at and debug. */
    appCamera: PerspectiveCamera
    /** The CameraTarget Object3D — used for look-at and debug. */
    cameraTarget: Object3D
    /** Reactive scroll percentage from the shared ScrollAnimator runtime. */
    percentageStore: Writable<number>
  }

  let { appCamera, cameraTarget, percentageStore }: Props = $props()

  // Camera debug state for e2e tests (world-space)
  let cameraProgress = $state(0)
  let cameraWorldX = $state(0)
  let cameraWorldY = $state(0)
  let cameraWorldZ = $state(0)
  let targetWorldX = $state(0)
  let targetWorldY = $state(0)
  let targetWorldZ = $state(0)

  // Diagnostic: whether the app camera is currently the active Threlte camera
  let cameraIsActive = $state(false)

  const threlte = useThrelte()

  // Reusable scratch vectors (avoid per-frame allocation)
  const _targetWorld = new Vector3()
  const _camWorld = new Vector3()

  function updateDebugState(): void {
    appCamera.getWorldPosition(_camWorld)
    cameraWorldX = _camWorld.x
    cameraWorldY = _camWorld.y
    cameraWorldZ = _camWorld.z

    cameraTarget.getWorldPosition(_targetWorld)
    targetWorldX = _targetWorld.x
    targetWorldY = _targetWorld.y
    targetWorldZ = _targetWorld.z
  }

  // Subscribe to scroll percentage from the shared runtime
  // scrollAnimatorRuntime.percentage is 0..100; assign directly (no extra scaling)
  $effect(() => {
    const unsub = percentageStore.subscribe((v) => {
      cameraProgress = v
      updateDebugState()
    })
    return unsub
  })

  // Per-frame: update debug coordinates
  useTask(() => {
    updateDebugState()
  }, { autoInvalidate: false })

  // Diagnostic: check if the app camera is the active Threlte camera
  useTask(() => {
    cameraIsActive = threlte.camera.current === appCamera
  }, { autoInvalidate: false })
</script>

<!-- Visually hidden debug element for e2e tests -->
<div
  class="camera-debug"
  data-testid="camera-state"
  data-progress={cameraProgress.toFixed(3)}
  data-x={cameraWorldX.toFixed(3)}
  data-y={cameraWorldY.toFixed(3)}
  data-z={cameraWorldZ.toFixed(3)}
  data-target-x={targetWorldX.toFixed(3)}
  data-target-y={targetWorldY.toFixed(3)}
  data-target-z={targetWorldZ.toFixed(3)}
  data-active={cameraIsActive}
  aria-hidden="true"
></div>
