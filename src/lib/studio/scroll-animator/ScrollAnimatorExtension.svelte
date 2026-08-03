<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { useStudio } from '@threlte/studio/extend'
  import { useObjectSelection, useTransactions } from '@threlte/studio/extensions'
  import type { Object3D } from 'three'

  let { children }: { children?: Snippet } = $props()
  import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'
  import type { ScrollAnimatorLike } from '../../types/scrollAnimator'

  import {
    clampPercentage,
    upsertKeyframe,
    deleteKeyframe,
    canonicalizeKeyframes,
  } from '$lib/spark/scrollAnimation'
  import { guardScrollAnimatorTransactions, isScrollAnimator, type GuardTransaction } from './transactionGuard'
  import { scrollAnimatorRuntime } from './scrollAnimatorRuntime'
  import FixedToolbarPane from './FixedToolbarPane.svelte'
  import CameraFrustumHelper from './CameraFrustumHelper.svelte'

  const { createExtension } = useStudio()
  const objectSelection = useObjectSelection()
  const transactions = useTransactions()

  // Extension state
  createExtension({
    scope: 'scroll-animator',
    state: ({ persist }) => ({
      paneVisible: persist<boolean>(false),
    }),
    actions: {},
  })

  // Transaction guard: suppress source sync for ScrollAnimator transforms
  let unsubscribeGuard: (() => void) | undefined

  // Reactive derived values from selection
  const selectedObjects = $derived(objectSelection.selectedObjects ?? [])
  const singleAnimator = $derived<ScrollAnimatorLike | null>(
    selectedObjects.length === 1 && isScrollAnimator(selectedObjects[0])
      ? selectedObjects[0]
      : null,
  )

  // Mutable UI state
  let uiState = $state({
    animator: null as Object3D | null,
    keyframes: [] as ScrollKeyframe[],
    percentageDraft: '0',
    inputFocused: false,
    committing: false,
  })

  // Reactive percentage from the shared runtime (via Svelte store subscription)
  let currentPercentage = $state(0)
  const unsubPercentage = scrollAnimatorRuntime.percentage.subscribe((value) => {
    currentPercentage = value
    // Only sync the draft when the input is not focused
    if (!uiState.inputFocused) {
      uiState.percentageDraft = value.toFixed(2)
    }
  })

  // Keep animator/keyframes in sync with selection
  // Also refresh after any transaction (commit/undo/redo)
  let revision = $state(0)
  $effect(() => {
    const sa = singleAnimator
    const rev = revision // re-run on transaction revision bump
    void rev
    uiState.animator = sa
    if (sa) {
      // Read keyframes via the getter (always returns a deep copy)
      uiState.keyframes = sa.keyframes ?? []
    } else {
      uiState.keyframes = []
    }
  })

  onMount(() => {
    // Guard transactions: suppress source sync for ScrollAnimator transforms
    // Also bump revision so the $effect refreshes the keyframe list
    unsubscribeGuard = transactions.onTransaction((txs) => {
      guardScrollAnimatorTransactions(txs as GuardTransaction[])
      // Bump revision to trigger keyframe list refresh
      revision += 1
    })
  })

  onDestroy(() => {
    unsubscribeGuard?.()
    unsubPercentage()
  })

  // Jump to a percentage via the shared runtime bridge
  function jumpToPercentage(percent: number): void {
    scrollAnimatorRuntime.jumpToPercentage(clampPercentage(percent))
  }

  // Handle percentage input
  function handlePercentageInput(e: Event) {
    const val = (e.target as HTMLInputElement).value
    uiState.percentageDraft = val
  }

  function handlePercentageCommit() {
    if (uiState.committing) return // guard against Enter→blur double commit
    uiState.committing = true
    const parsed = parseFloat(uiState.percentageDraft)
    if (isNaN(parsed)) {
      uiState.percentageDraft = currentPercentage.toFixed(2)
      uiState.committing = false
      return
    }
    const clamped = clampPercentage(parsed)
    uiState.percentageDraft = clamped.toFixed(2)
    jumpToPercentage(clamped)
    // Reset guard after a short delay so blur can fire without re-committing
    setTimeout(() => { uiState.committing = false }, 50)
  }

  // Insert/save keyframe
  function handleInsertKeyframe(): void {
    const animator = uiState.animator
    if (!animator || !isScrollAnimator(animator)) return
    if (!transactions.vitePluginEnabled) return

    const normalized = clampPercentage(currentPercentage)

    // Read local position and Euler rotation from the animator
    const pos = [
      Math.round(animator.position.x * 10000) / 10000,
      Math.round(animator.position.y * 10000) / 10000,
      Math.round(animator.position.z * 10000) / 10000,
    ] as [number, number, number]

    const euler = animator.rotation.toArray()
    const rot = [
      Math.round(euler[0] * 10000) / 10000,
      Math.round(euler[1] * 10000) / 10000,
      Math.round(euler[2] * 10000) / 10000,
    ] as [number, number, number]

    const currentKfs = animator.keyframes ?? []
    const newKeyframes = upsertKeyframe(currentKfs, normalized, pos, rot)

    // Commit as a transaction with source sync
    const historicKeyframes = canonicalizeKeyframes(currentKfs)

    const tx = transactions.buildTransaction({
      object: animator,
      propertyPath: 'keyframes',
      value: newKeyframes,
      historicValue: historicKeyframes,
      createHistoryRecord: true,
      sync: true,
    })

    transactions.commit([tx])
    // The onTransaction callback will bump revision and refresh the list
  }

  // Delete keyframe
  function handleDeleteKeyframe(scroll: number): void {
    const animator = uiState.animator
    if (!animator || !isScrollAnimator(animator)) return
    if (!transactions.vitePluginEnabled) return

    const currentKfs = animator.keyframes ?? []
    const newKeyframes = deleteKeyframe(currentKfs, scroll)

    const historicKeyframes = canonicalizeKeyframes(currentKfs)

    const tx = transactions.buildTransaction({
      object: animator,
      propertyPath: 'keyframes',
      value: newKeyframes,
      historicValue: historicKeyframes,
      createHistoryRecord: true,
      sync: true,
    })

    transactions.commit([tx])
    // The onTransaction callback will bump revision and refresh the list
  }

  // Jump to keyframe percentage
  function handleJumpToKeyframe(scroll: number): void {
    jumpToPercentage(scroll)
  }
</script>

<FixedToolbarPane>
  {#if !uiState.animator}
    <div class="sa-no-selection">Select one ScrollAnimator</div>
  {:else}
    <div class="sa-panel">
      <div class="sa-animator-name">{uiState.animator.name || 'ScrollAnimator'}</div>

      {#if !transactions.vitePluginEnabled}
        <div class="sa-warning">Studio source sync unavailable — persistence controls disabled</div>
      {/if}

      <!-- Percentage input — always available for navigation -->
      <div class="sa-percent-row">
        <label class="sa-label" for="sa-percent-input">Percentage:</label>
        <input
          id="sa-percent-input"
          type="number"
          class="sa-percent-input"
          min="0"
          max="100"
          step="0.01"
          value={uiState.percentageDraft}
          onfocus={() => { uiState.inputFocused = true }}
          onblur={() => {
            uiState.inputFocused = false
            handlePercentageCommit()
          }}
          oninput={handlePercentageInput}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handlePercentageCommit()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <span class="sa-percent-display">{currentPercentage.toFixed(2)}%</span>
      </div>

      <!-- Keyframe list -->
      <div class="sa-keyframes">
        {#each uiState.keyframes as kf}
          <div class="sa-kf-row">
            <button
              class="sa-kf-pct"
              type="button"
              onclick={() => handleJumpToKeyframe(kf.scroll)}
              title="Jump to {kf.scroll.toFixed(2)}%"
            >
              {kf.scroll.toFixed(2)}%
            </button>
            <span class="sa-kf-pos">[{kf.position.map((v) => v.toFixed(2)).join(', ')}]</span>
            {#if transactions.vitePluginEnabled}
              <button
                class="sa-kf-delete"
                type="button"
                onclick={() => handleDeleteKeyframe(kf.scroll)}
                title="Delete keyframe"
                aria-label="Delete keyframe at {kf.scroll.toFixed(2)}%"
              >
                ✕
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Insert keyframe button — only when source sync available -->
      {#if transactions.vitePluginEnabled}
        <button class="sa-insert-btn" type="button" onclick={handleInsertKeyframe}>
          Insert/save scroll keyframe
        </button>
      {/if}
    </div>
  {/if}
</FixedToolbarPane>

<!-- Camera frustum helper: editor-only, mounted inside Studio context -->
<CameraFrustumHelper />

{@render children?.()}

<style>
  .sa-no-selection {
    padding: 8px;
    color: #888;
    font-size: 12px;
  }

  .sa-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px;
  }

  .sa-animator-name {
    font-weight: 600;
    font-size: 12px;
    color: #ccc;
    margin-bottom: 2px;
  }

  .sa-warning {
    color: #f0ad4e;
    font-size: 11px;
    font-style: italic;
  }

  .sa-percent-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .sa-label {
    color: #999;
    white-space: nowrap;
  }

  .sa-percent-input {
    width: 60px;
    padding: 2px 4px;
    font-size: 11px;
    background: #333;
    color: #e0e0e0;
    border: 1px solid #555;
    border-radius: 3px;
  }

  .sa-percent-display {
    color: #6366f1;
    font-weight: 600;
  }

  .sa-keyframes {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }

  .sa-kf-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 11px;
    background: #2a2a2a;
  }

  .sa-kf-pct {
    color: #6366f1;
    cursor: pointer;
    font-weight: 600;
    min-width: 50px;
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    text-align: left;
  }

  .sa-kf-pct:hover {
    text-decoration: underline;
  }

  .sa-kf-pos {
    color: #888;
    flex: 1;
    font-family: monospace;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sa-kf-delete {
    color: #f87171;
    cursor: pointer;
    background: none;
    border: none;
    font-size: 12px;
    padding: 0 4px;
    line-height: 1;
  }

  .sa-kf-delete:hover {
    color: #ff4444;
  }

  .sa-insert-btn {
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    border: none;
    border-radius: 4px;
    background: #6366f1;
    color: #fff;
    cursor: pointer;
    margin-top: 4px;
  }

  .sa-insert-btn:hover {
    background: #4f46e5;
  }
</style>
