<script lang="ts">
  import { useThrelte, useTask } from '@threlte/core'
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { Object3D, PerspectiveCamera, Vector3 } from 'three'
  import { ScrollTrigger } from 'gsap/ScrollTrigger'
  import { gsap } from 'gsap'
  import { isScrollAnimator } from '$lib/studio/scroll-animator/transactionGuard'
  import { scrollAnimatorRuntime } from '$lib/studio/scroll-animator/scrollAnimatorRuntime'
  import { activeSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'
  import type { SparkControls } from '$lib/spark/SparkControls'
  import SparkStudioBridge from './SparkStudioBridge.svelte'
  import SparkSplats from './SparkSplats.svelte'
  import CameraDiagnostics from './CameraDiagnostics.svelte'

  interface Props {
    url: string
    onReady?: () => void
    /** Scene-specific SparkControls instance for the bridge. Required. */
    sparkControls: SparkControls
    /** Scene-provided stable wrapper for the SplatMesh. */
    splatWrapper: Object3D
    /** The app's PerspectiveCamera — always used for look-at and debug. */
    appCamera: PerspectiveCamera
    /** The CameraTarget Object3D — always used for look-at and debug. */
    cameraTarget: Object3D
    /** Whether source sync should be enabled for this scene's SparkControls. */
    sourceSyncEnabled?: boolean
    children?: Snippet
  }

  let { url, onReady, sparkControls, splatWrapper, appCamera, cameraTarget, sourceSyncEnabled = true, children }: Props = $props()

  let loaded = $state(false)
  let scrollTrigger: ReturnType<typeof ScrollTrigger.create> | null = null

  const threlte = useThrelte()

  // Reusable scratch vector for look-at (avoid per-frame allocation)
  const _targetWorld = new Vector3()

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
        object.applyScrollPercentage(percent)
      }
    })
  }

  // Threlte task: update camera look-at every frame
  // Always uses the app camera — never forces the editor camera
  useTask(() => {
    cameraTarget.getWorldPosition(_targetWorld)
    appCamera.lookAt(_targetWorld)
  }, { autoInvalidate: false })

  // Register SparkControls with the active-controller runtime
  let detachSparkControls: (() => void) | null = null

  onMount(() => {
    if (typeof window === 'undefined') return

    // Register SparkControls with the active-controller runtime
    // Use the profile name from the SparkControls itself (set at construction)
    detachSparkControls = activeSparkControlsRuntime.attach(sparkControls, sparkControls.profileName, {
      sourceSyncEnabled,
    })

    // Stub-only: expose scene UUID, app camera UUID, and register SparkControls
    // for disposal tracking — all for e2e identity assertions
    if (window.__spark_stub === true) {
      const scene = threlte.scene
      window.__stub_scene_uuid = scene?.uuid ?? null
      window.__stub_app_camera_uuid = appCamera.uuid
      const register = window.__spark_stub_register_controls
      if (typeof register === 'function') register(sparkControls)
      // Expose the active controller for e2e external-setter tests
      window.__spark_stub_active_controls = sparkControls
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
    // Stub-only: identity-safe clear of active controls reference
    // (only delete if it still points to this scene's sparkControls)
    if (window.__spark_stub === true) {
      const current = window.__spark_stub_active_controls
      if (current === sparkControls) {
        delete window.__spark_stub_active_controls
      }
    }
    // Dispose SparkControls on scene unmount (single owner)
    // Stub-only: record disposal for e2e lifecycle assertions
    if (window.__spark_stub === true) {
      const record = window.__spark_stub_record_controls_disposal
      if (typeof record === 'function') record(sparkControls)
    }
    sparkControls.dispose()
  })
</script>

<!-- SparkSplats: stable SplatWrapper with reload coordination (before bridge so splatsRef is set) -->
<SparkSplats bind:this={splatsRef} {url} wrapper={splatWrapper} onStatusChange={handleReloadStatus} pagerIdentity={getPagerIdentity} triggerUpdate={triggerRendererUpdate} />

<!-- SparkStudioBridge: manages dual SparkRenderer lifecycle -->
<SparkStudioBridge bind:this={bridgeRef} {sparkControls} radUrl={url} onMeshReload={splatsRef?.reload} />

<!-- Scene-specific content: camera animators, target animator, SparkControls, splats -->
{#if children}
  {@render children()}
{/if}

<!-- Camera diagnostics for e2e tests — only rendered in stub builds -->
{#if import.meta.env.VITE_E2E_STUB_SPARK === 'true'}
  <CameraDiagnostics {appCamera} {cameraTarget} percentageStore={scrollAnimatorRuntime.percentage} />
{/if}

{#if !loaded}
  <div class="scroll-hint">Scroll to change view</div>
{/if}
