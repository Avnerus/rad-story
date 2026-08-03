<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import { useObjectSelection } from '@threlte/studio/extensions'
  import { useThrelte, useTask } from '@threlte/core'
  import { CameraHelper, PerspectiveCamera, Object3D } from 'three'
  import { isScrollAnimator } from './transactionGuard'
  import type { ScrollAnimatorLike } from '../../types/scrollAnimator'
  import { findAllDescendantCameras } from './descendantCameraResolver'

  /**
   * CameraFrustumHelper — shows a Three.js CameraHelper for the descendant
   * PerspectiveCamera of a selected ScrollAnimator that has
   * `showChildCameraFrustumWhenSelected = true`.
   *
   * The helper is added to the Three.js scene root (not the animator) so
   * that the CameraHelper's world transform is correct. It tracks the
   * animated camera's world transform every frame via useTask.
   *
   * Direct PerspectiveCamera selection is NOT handled here — Studio's
   * built-in Helpers extension already provides that behavior. This
   * integration only extends selection for opted-in ScrollAnimators.
   *
   * Contract: the selected animator must have **exactly one** descendant
   * PerspectiveCamera. Zero or multiple matches produce no custom helper.
   */

  let { children }: { children?: Snippet } = $props()

  const objectSelection = useObjectSelection()
  const threlte = useThrelte()

  let helper: CameraHelper | null = null
  let helperTargetCamera: PerspectiveCamera | null = null

  // Lifecycle counters for stub diagnostics
  let helpersCreated = 0
  let helpersDisposed = 0

  // Brand owned helpers so we can count them in the scene
  const HELPER_BRAND = '__camera_frustum_helper_owned'

  /**
   * Remove and dispose the current helper.
   */
  function removeHelper(): void {
    if (helper) {
      const scene = threlte.scene
      if (scene) {
        scene.remove(helper)
      }
      // Dispose geometry and materials to prevent leaks
      helper.traverse((obj) => {
        if ('geometry' in obj && obj.geometry && typeof (obj.geometry as { dispose?: () => void }).dispose === 'function') {
          (obj.geometry as { dispose: () => void }).dispose()
        }
        if ('material' in obj && obj.material) {
          const mat = obj.material as { dispose?: () => void }
          if (typeof mat.dispose === 'function') mat.dispose()
        }
      })
      helpersDisposed++
    }
    helper = null
    helperTargetCamera = null
  }

  // Reactive derived: the single selected object (or null)
  const selectedObjects = $derived(objectSelection.selectedObjects ?? [])
  const singleSelected = $derived<Object3D | null>(
    selectedObjects.length === 1 ? selectedObjects[0] : null,
  )

  // Update helper on selection changes
  $effect(() => {
    removeHelper()

    const obj = singleSelected
    if (!obj) return

    // Only create helper for opted-in ScrollAnimators
    if (!isScrollAnimator(obj)) return

    const animator = obj as ScrollAnimatorLike
    if (!animator.showChildCameraFrustumWhenSelected) return

    // Exact-one contract: resolve ALL descendant cameras
    const cameras = findAllDescendantCameras(obj)
    if (cameras.length !== 1) return

    const targetCamera = cameras[0]
    const scene = threlte.scene
    if (!scene) return

    helper = new CameraHelper(targetCamera)
    helper.userData.ignoreOverrideMaterial = true
    helper.userData[HELPER_BRAND] = true
    helperTargetCamera = targetCamera
    helpersCreated++
    scene.add(helper)
  })

  // Update helper transform every frame (tracks animated camera position)
  useTask(() => {
    if (helper && helperTargetCamera) {
      helper.update()
    }
  }, { autoInvalidate: false })

  onDestroy(() => {
    removeHelper()

    // Remove diagnostic on destroy only if it still points to this instance
    // so an old instance cannot delete a newer instance's diagnostic
    if (typeof window !== 'undefined') {
      const current = window.__camera_frustum_helper_diagnostic
      if (current === exposeHelperDiagnostic) {
        delete window.__camera_frustum_helper_diagnostic
      }
    }
  })

  // ---------------------------------------------------------------------------
  // Test-only diagnostic: exposed ONLY in e2e stub builds
  // ---------------------------------------------------------------------------

  function exposeHelperDiagnostic(): {
    /** Number of owned helpers currently attached to the scene (branded). */
    ownedHelperCount: number
    /** Whether this component's helper is currently active. */
    helperExists: boolean
    /** Type of the camera targeted by this component's helper. */
    targetCameraType: string | null
    /** UUID of the camera targeted by this component's helper. */
    targetCameraUuid: string | null
    /** UUID of the parent (scene root) of this component's helper, or null. */
    helperParentUuid: string | null
    /** UUID of the Three.js scene root. */
    sceneUuid: string | null
    /** Total helpers created by this instance over its lifetime. */
    helpersCreated: number
    /** Total helpers disposed by this instance over its lifetime. */
    helpersDisposed: number
  } {
    const scene = threlte.scene
    // Count branded helpers by inspecting scene children's userData independently
    let ownedCount = 0
    if (scene) {
      for (const child of scene.children) {
        if ((child.userData as Record<string, unknown>)[HELPER_BRAND] === true) {
          ownedCount++
        }
      }
    }
    return {
      ownedHelperCount: ownedCount,
      helperExists: helper !== null,
      targetCameraType: helperTargetCamera ? helperTargetCamera.type : null,
      targetCameraUuid: helperTargetCamera ? helperTargetCamera.uuid : null,
      helperParentUuid: helper?.parent ? helper.parent.uuid : null,
      sceneUuid: scene ? scene.uuid : null,
      helpersCreated,
      helpersDisposed,
    }
  }

  // Install diagnostic only in stub builds
  if (typeof window !== 'undefined' && window.__spark_stub === true) {
    window.__camera_frustum_helper_diagnostic = exposeHelperDiagnostic
  }
</script>

<!-- No DOM output — manages Three.js CameraHelper lifecycle only -->
{@render children?.()}
