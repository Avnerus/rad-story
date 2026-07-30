<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import { useObjectSelection } from '@threlte/studio/extensions'
  import { useThrelte, useTask } from '@threlte/core'
  import { CameraHelper, PerspectiveCamera, Object3D } from 'three'
  import { isScrollAnimator } from './transactionGuard'

  /**
   * CameraFrustumHelper — shows a Three.js CameraHelper for the descendant
   * PerspectiveCamera of a selected ScrollAnimator that has
   * `showChildCameraFrustumWhenSelected = true`.
   *
   * Also shows the helper when the PerspectiveCamera itself is selected
   * (mirrors Studio's built-in Helpers behavior).
   *
   * The helper tracks the animated camera's world transform every frame.
   * It is editor visualization only and does not affect rendering.
   */

  let { children }: { children?: Snippet } = $props()

  const objectSelection = useObjectSelection()
  const threlte = useThrelte()

  let helper: CameraHelper | null = null
  let helperParent: Object3D | null = null

  /**
   * Find the first descendant PerspectiveCamera in an Object3D hierarchy.
   */
  function findDescendantCamera(obj: Object3D): PerspectiveCamera | null {
    let result: PerspectiveCamera | null = null
    obj.traverse((child) => {
      if (result) return
      if (child.type === 'PerspectiveCamera') {
        result = child as PerspectiveCamera
      }
    })
    return result
  }

  /**
   * Remove the current helper from its parent.
   */
  function removeHelper(): void {
    if (helper && helperParent) {
      helperParent.remove(helper)
    }
    helper = null
    helperParent = null
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

    let targetCamera: PerspectiveCamera | null = null
    let parent: Object3D | null = null

    if (isScrollAnimator(obj)) {
      const animator = obj as unknown as { showChildCameraFrustumWhenSelected?: boolean }
      if (animator.showChildCameraFrustumWhenSelected) {
        targetCamera = findDescendantCamera(obj)
        parent = obj
      }
    }

    // Also show helper when the camera itself is selected (mirrors built-in Helpers)
    if (!targetCamera && obj.type === 'PerspectiveCamera') {
      targetCamera = obj as PerspectiveCamera
      parent = threlte.scene ?? null
    }

    if (targetCamera && parent) {
      helper = new CameraHelper(targetCamera)
      helper.userData.ignoreOverrideMaterial = true
      parent.add(helper)
      helperParent = parent
    }
  })

  // Update helper transform every frame (tracks animated camera position)
  useTask(() => {
    if (helper) {
      helper.update()
    }
  }, { autoInvalidate: false })

  onDestroy(() => {
    removeHelper()
  })
</script>

<!-- No DOM output — manages Three.js CameraHelper lifecycle only -->
{@render children?.()}
