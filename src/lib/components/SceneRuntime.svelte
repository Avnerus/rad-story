<script lang="ts">
  import { useThrelte, useTask } from '@threlte/core'
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { Object3D, Vector3 } from 'three'
  import { ScrollTrigger } from 'gsap/ScrollTrigger'
  import { gsap } from 'gsap'
  import { isScrollAnimator } from '$lib/studio/scroll-animator/transactionGuard'
  import { scrollAnimatorRuntime } from '$lib/studio/scroll-animator/scrollAnimatorRuntime'
  import type { DeviceProfile } from '$lib/types'
  import type { SparkControls } from '$lib/spark/SparkControls'
  import SparkStudioBridge from './SparkStudioBridge.svelte'
  import SparkSplats from './SparkSplats.svelte'
  import CameraFrustumHelper from '$lib/studio/scroll-animator/CameraFrustumHelper.svelte'

  /** Shared debug state exposed to parent via Svelte context. */
  export interface SceneDebugState {
    progress: number
    cameraX: number
    cameraY: number
    cameraZ: number
    targetX: number
    targetY: number
    targetZ: number
    cameraActive: boolean
    loaded: boolean
  }

  interface Props {
    url: string
    profile: DeviceProfile
    onReady?: () => void
    /** Scene-specific SparkControls instance for the bridge. */
    sparkControls?: SparkControls | null
    /** Callback to receive debug state updates (for parent's debug element). */
    onDebugState?: (state: SceneDebugState) => void
    children?: Snippet
  }

  let { url, profile, onReady, sparkControls = null, onDebugState, children }: Props = $props()

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
    const currentCamera = threlte.camera.current
    if (currentCamera) {
      currentCamera.getWorldPosition(_camWorld)
      cameraWorldX = _camWorld.x
      cameraWorldY = _camWorld.y
      cameraWorldZ = _camWorld.z
    }

    // Find CameraTarget in scene for debug state
    const sceneRef = threlte.scene
    if (sceneRef) {
      sceneRef.traverse((obj: Object3D) => {
        if (obj.name === 'CameraTarget') {
          obj.getWorldPosition(_targetWorld)
        }
      })
    }
    targetWorldX = _targetWorld.x
    targetWorldY = _targetWorld.y
    targetWorldZ = _targetWorld.z

    // Push debug state to parent
    if (onDebugState) {
      onDebugState({
        progress: cameraProgress,
        cameraX: cameraWorldX,
        cameraY: cameraWorldY,
        cameraZ: cameraWorldZ,
        targetX: targetWorldX,
        targetY: targetWorldY,
        targetZ: targetWorldZ,
        cameraActive: cameraIsActive,
        loaded,
      })
    }
  }

  // Threlte task: update camera look-at and debug state every frame
  useTask(() => {
    const currentCamera = threlte.camera.current
    if (!currentCamera) return

    // Find CameraTarget in scene
    const sceneRef = threlte.scene
    if (sceneRef) {
      let targetPos: Vector3 | null = null
      sceneRef.traverse((obj: Object3D) => {
        if (obj.name === 'CameraTarget') {
          targetPos = obj.getWorldPosition(_targetWorld)
        }
      })
      if (targetPos) {
        currentCamera.lookAt(targetPos)
      }
    }
    updateDebugState()
  }, { autoInvalidate: false })

  // Diagnostic: check if the default Threlte camera is active
  useTask(() => {
    const current = threlte.camera.current
    // Find the PerspectiveCamera that was made default
    const sceneRef = threlte.scene
    if (sceneRef) {
      sceneRef.traverse((obj: Object3D) => {
        if (obj.type === 'PerspectiveCamera' && obj.userData._isAppCamera === true) {
          cameraIsActive = current === obj
        }
      })
    }
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
    // Push initial debug state so parent's debug element is populated
    updateDebugState()
    onReady?.()
  })

  onDestroy(() => {
    if (scrollTrigger) {
      scrollAnimatorRuntime.detach(scrollTrigger)
      scrollTrigger.kill()
      scrollTrigger = null
    }
  })
</script>

<!-- SparkStudioBridge: manages dual SparkRenderer lifecycle -->
<SparkStudioBridge bind:this={bridgeRef} {profile} {sparkControls} radUrl={url} onMeshReload={splatsRef?.reload} />

<!-- Scene-specific content: camera animators, target animator, SparkControls, splats -->
{#if children}
  {@render children()}
{/if}

<!-- SparkSplats: stable SplatWrapper with reload coordination -->
<SparkSplats bind:this={splatsRef} {url} onStatusChange={handleReloadStatus} pagerIdentity={getPagerIdentity} triggerUpdate={triggerRendererUpdate} />

<!-- Camera frustum helper: shows CameraHelper for opted-in ScrollAnimators -->
<CameraFrustumHelper />
