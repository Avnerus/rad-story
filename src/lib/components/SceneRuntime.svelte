<script lang="ts">
  import { useThrelte, useTask } from '@threlte/core'
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { Object3D, PerspectiveCamera, Vector3 } from 'three'
  import { ScrollTrigger } from 'gsap/ScrollTrigger'
  import { gsap } from 'gsap'
  import { isScrollAnimator } from '$lib/studio/scroll-animator/transactionGuard'
  import { scrollAnimatorRuntime } from '$lib/studio/scroll-animator/scrollAnimatorRuntime'
  import { activeSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'
  import type { DeviceProfile } from '$lib/types'
  import type { SparkControls } from '$lib/spark/SparkControls'
  import SparkStudioBridge from './SparkStudioBridge.svelte'
  import SparkSplats from './SparkSplats.svelte'

  interface Props {
    url: string
    profile: DeviceProfile
    onReady?: () => void
    /** Scene-specific SparkControls instance for the bridge. */
    sparkControls?: SparkControls | null
    /** Scene-provided stable wrapper for the SplatMesh. */
    splatWrapper: Object3D
    /** The app's PerspectiveCamera — always used for look-at and debug. */
    appCamera: PerspectiveCamera
    /** The CameraTarget Object3D — always used for look-at and debug. */
    cameraTarget: Object3D
    children?: Snippet
  }

  let { url, profile, onReady, sparkControls = null, splatWrapper, appCamera, cameraTarget, children }: Props = $props()

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

  let loaded = $state(false)
  let scrollTrigger: ReturnType<typeof ScrollTrigger.create> | null = null

  const threlte = useThrelte()

  // Reusable scratch vectors for look-at and debug (avoid per-frame allocation)
  const _targetWorld = new Vector3()
  const _camWorld = new Vector3()

  // Mesh reload callback — wired from SparkSplats to SparkStudioBridge
  let splatsRef = $state<{ reload: (url: string) => Promise<void>; getWrapper: () => Object3D } | null>(null)
  let bridgeRef = $state<{ getPagerIdentity: () => unknown; triggerRendererUpdate: () => void } | null>(null)

  // Reload status: SparkSplats coordinator writes to sparkControls.reloadStatus directly
  function handleReloadStatus(status: import('$lib/spark/SparkReloadRuntime').ReloadStatus): void {
    sparkControls?.reloadStatus.update(status)
  }

  // Pager identity: returns the driving renderer's pager for handoff verification
  function getPagerIdentity(): unknown {
    return bridgeRef?.getPagerIdentity() ?? undefined
  }

  // Trigger renderer update (drives pager handoff in stub builds)
  function triggerRendererUpdate(): void {
    bridgeRef?.triggerRendererUpdate()
  }

  // Scene-wide animator playback: traverse scene and apply to every branded ScrollAnimator
  function applyScrollToAllAnimators(percent: number): void {
    const scene = threlte.scene
    if (!scene) return
    scene.traverse((object: Object3D) => {
      if (isScrollAnimator(object)) {
        (object as unknown as { applyScrollPercentage: (p: number) => void }).applyScrollPercentage(percent)
      }
    })
    cameraProgress = percent
    updateDebugState()
  }

  function updateDebugState(): void {
    // Always use the app camera (not threlte.camera.current)
    appCamera.getWorldPosition(_camWorld)
    cameraWorldX = _camWorld.x
    cameraWorldY = _camWorld.y
    cameraWorldZ = _camWorld.z

    cameraTarget.getWorldPosition(_targetWorld)
    targetWorldX = _targetWorld.x
    targetWorldY = _targetWorld.y
    targetWorldZ = _targetWorld.z
  }

  // Threlte task: update camera look-at and debug state every frame
  // Always uses the app camera — never forces the editor camera
  useTask(() => {
    cameraTarget.getWorldPosition(_targetWorld)
    appCamera.lookAt(_targetWorld)
    updateDebugState()
  }, { autoInvalidate: false })

  // Diagnostic: check if the app camera is the active Threlte camera
  useTask(() => {
    cameraIsActive = threlte.camera.current === appCamera
  }, { autoInvalidate: false })

  // Register SparkControls with the active-controller runtime
  let detachSparkControls: (() => void) | null = null

  onMount(() => {
    if (typeof window === 'undefined') return

    // Register SparkControls with the active-controller runtime
    if (sparkControls) {
      detachSparkControls = activeSparkControlsRuntime.attach(sparkControls)
    }

    // Stub-only: expose scene UUID, app camera UUID, and register SparkControls
    // for disposal tracking — all for e2e identity assertions
    if ((window as unknown as Record<string, unknown>).__spark_stub === true) {
      const scene = threlte.scene
      ;(window as unknown as Record<string, unknown>).__stub_scene_uuid = scene?.uuid ?? null
      ;(window as unknown as Record<string, unknown>).__stub_app_camera_uuid = appCamera.uuid
      if (sparkControls) {
        const register = (window as unknown as Record<string, unknown>).__spark_stub_register_controls
        if (typeof register === 'function') register(sparkControls)
      }
    }

    // Register GSAP ScrollTrigger
    gsap.registerPlugin(ScrollTrigger)

    // Use the .scroll-spacer element as the trigger
    const spacer = document.querySelector<HTMLElement>('.scroll-spacer')
    if (!spacer) return

    scrollTrigger = ScrollTrigger.create({
      trigger: spacer,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const percent = self.progress * 100
        scrollAnimatorRuntime.updateProgress(self.progress)
        applyScrollToAllAnimators(percent)
      },
    })

    // Attach the trigger to the shared runtime bridge
    scrollAnimatorRuntime.attach(scrollTrigger)

    // Apply initial pose from the current ScrollTrigger progress
    applyScrollToAllAnimators(scrollTrigger.progress * 100)

    // Mark as loaded
    loaded = true
    onReady?.()
  })

  onDestroy(() => {
    if (scrollTrigger) {
      scrollAnimatorRuntime.detach(scrollTrigger)
      scrollTrigger.kill()
      scrollTrigger = null
    }
    // Detach from active-controller runtime (identity-safe)
    detachSparkControls?.()
    detachSparkControls = null
    // Dispose SparkControls on scene unmount (single owner)
    if (sparkControls) {
      // Stub-only: record disposal for e2e lifecycle assertions
      if ((window as unknown as Record<string, unknown>).__spark_stub === true) {
        const record = (window as unknown as Record<string, unknown>).__spark_stub_record_controls_disposal
        if (typeof record === 'function') record(sparkControls)
      }
      sparkControls.dispose()
    }
  })
</script>

<!-- SparkSplats: stable SplatWrapper with reload coordination (before bridge so splatsRef is set) -->
<SparkSplats bind:this={splatsRef} {url} wrapper={splatWrapper} onStatusChange={handleReloadStatus} pagerIdentity={getPagerIdentity} triggerUpdate={triggerRendererUpdate} />

<!-- SparkStudioBridge: manages dual SparkRenderer lifecycle -->
<SparkStudioBridge bind:this={bridgeRef} {profile} {sparkControls} radUrl={url} onMeshReload={splatsRef?.reload} />

<!-- Scene-specific content: camera animators, target animator, SparkControls, splats -->
{#if children}
  {@render children()}
{/if}

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

{#if !loaded}
  <div class="scroll-hint">Scroll to change view</div>
{/if}
