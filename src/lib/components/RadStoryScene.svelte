<script lang="ts">
  import { T, useThrelte, useTask } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { PerspectiveCamera, Object3D, Vector3 } from 'three'
  import { ScrollTrigger } from 'gsap/ScrollTrigger'
  import { gsap } from 'gsap'
  import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
  import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'
  import { isScrollAnimator } from '$lib/studio/scroll-animator/transactionGuard'
  import { scrollAnimatorRuntime } from '$lib/studio/scroll-animator/scrollAnimatorRuntime'
  import type { DeviceProfile } from '$lib/types'
  import { SparkControls } from '$lib/spark/SparkControls'
  import SparkSplats from './SparkSplats.svelte'
  import SparkStudioBridge from './SparkStudioBridge.svelte'

  interface Props {
    url: string
    profile: DeviceProfile
    onReady?: () => void
  }

  let { url, profile, onReady }: Props = $props()

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

  // Real camera — registered declaratively via makeDefault on <T> below
  const camera = new PerspectiveCamera(60, 1, 0.1, 10_000)

  // CameraTarget — an Object3D that the camera always looks at (world position)
  const cameraTarget = new Object3D()
  cameraTarget.name = 'CameraTarget'

  // ScrollAnimators
  const cameraAnimator = new ScrollAnimator()
  cameraAnimator.name = 'Camera ScrollAnimator'
  cameraAnimator.keyframes = [
    { scroll: 0, position: [0, 0, -1], rotation: [0, 0, 0] },
    { scroll: 100, position: [0, 30, -1], rotation: [0, 0, 0] },
  ] as ScrollKeyframe[]

  const targetAnimator = new ScrollAnimator()
  targetAnimator.name = 'Camera Target ScrollAnimator'
  targetAnimator.keyframes = [
    { scroll: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
  ] as ScrollKeyframe[]

  // Apply initial poses
  cameraAnimator.applyScrollPercentage(0)
  targetAnimator.applyScrollPercentage(0)

  // SparkControls — Studio-editable Spark quality/LOD settings
  const sparkControls = new SparkControls({
    lodSplatScale: profile.sparkRenderer.lodSplatScale,
    lodRenderScale: profile.sparkRenderer.lodRenderScale,
    maxStdDev: profile.sparkRenderer.maxStdDev,
    maxPagedSplats: profile.sparkRenderer.maxPagedSplats,
    coneFov0: profile.sparkRenderer.coneFov0,
    coneFov: profile.sparkRenderer.coneFov,
    coneFoveate: profile.sparkRenderer.coneFoveate,
    behindFoveate: profile.sparkRenderer.behindFoveate,
  })

  // Mesh reload callback — wired from SparkSplats to SparkStudioBridge
  let splatsRef: { reload: (url: string) => Promise<void> } | null = null
  // Bridge ref for pager identity and renderer update
  let bridgeRef: { getPagerIdentity: () => unknown; triggerRendererUpdate: () => void } | null = null

  // Reload status: SparkSplats coordinator writes to sparkControls.reloadStatus directly
  function handleReloadStatus(status: import('$lib/spark/SparkReloadRuntime').ReloadStatus): void {
    sparkControls.reloadStatus.update(status)
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

  // Reusable scratch vectors for look-at and debug (avoid per-frame allocation)
  const _targetWorld = new Vector3()
  const _camWorld = new Vector3()

  function updateDebugState(): void {
    camera.getWorldPosition(_camWorld)
    cameraWorldX = _camWorld.x
    cameraWorldY = _camWorld.y
    cameraWorldZ = _camWorld.z

    cameraTarget.getWorldPosition(_targetWorld)
    targetWorldX = _targetWorld.x
    targetWorldY = _targetWorld.y
    targetWorldZ = _targetWorld.z
  }

  // Threlte task: update camera look-at and debug state every frame
  // Uses public useTask; autoInvalidate false because we rely on the render loop
  useTask(() => {
    cameraTarget.getWorldPosition(_targetWorld)
    camera.lookAt(_targetWorld)
    updateDebugState()
  }, { autoInvalidate: false })

  // Diagnostic: check if our camera is the active Threlte camera
  useTask(() => {
    cameraIsActive = threlte.camera.current === camera
  }, { autoInvalidate: false })

  onMount(() => {
    if (typeof window === 'undefined') return

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
    sparkControls.dispose()
  })
</script>

<!-- Camera ScrollAnimator with real camera as child -->
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

<!-- Camera Target ScrollAnimator with CameraTarget as child -->
<T
  is={targetAnimator}
  name="Camera Target ScrollAnimator"
  keyframes={[
    { scroll: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
  ]}
>
  <T is={cameraTarget} name="CameraTarget" />
</T>

<SparkStudioBridge bind:this={bridgeRef} {profile} {sparkControls} radUrl={url} onMeshReload={splatsRef?.reload} />

<!-- SparkControls: Studio-editable Spark quality/LOD settings -->
<T is={sparkControls} name="Spark" settings={sparkControls.settings} />

<SparkSplats bind:this={splatsRef} {url} onStatusChange={handleReloadStatus} pagerIdentity={getPagerIdentity} triggerUpdate={triggerRendererUpdate} />

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
