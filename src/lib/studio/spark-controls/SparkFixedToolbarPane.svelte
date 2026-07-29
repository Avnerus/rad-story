<script lang="ts">
  import { onMount, onDestroy, tick, type Snippet } from 'svelte'
  import { ToolbarButton, ToolbarItem } from '@threlte/studio/extend'
  import { autoUpdate, computePosition, flip, offset, shift, type ComputePositionReturn } from '@floating-ui/dom'

  let { children }: { children?: Snippet } = $props()

  let anchorEl = $state<HTMLElement>()
  let panelEl = $state<HTMLElement>()
  let open = $state(false)
  let stopAutoUpdate: (() => void) | undefined

  function portal(node: HTMLElement): { destroy: () => void } {
    document.body.appendChild(node)
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node)
      },
    }
  }

  function updatePosition(): void {
    const anchor = anchorEl
    const panel = panelEl
    if (!anchor || !panel) return
    computePosition(anchor, panel, {
      strategy: 'fixed',
      placement: 'bottom',
      middleware: [offset(2), flip(), shift({ padding: 6 })],
    }).then((pos: ComputePositionReturn) => {
      if (panelEl === panel && open) {
        Object.assign(panelEl.style, {
          left: `${pos.x}px`,
          top: `${pos.y}px`,
        })
      }
    })
  }

  async function openPanel(): Promise<void> {
    open = true
    await tick()
    if (!open || !anchorEl || !panelEl) return
    stopAutoUpdate?.()
    stopAutoUpdate = autoUpdate(anchorEl, panelEl, updatePosition)
  }

  function closePanel(): void {
    open = false
    stopAutoUpdate?.()
    stopAutoUpdate = undefined
  }

  function togglePanel(): void {
    if (open) closePanel()
    else openPanel()
  }

  function focusToggle(): void {
    anchorEl?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      closePanel()
      focusToggle()
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown)
    stopAutoUpdate?.()
    stopAutoUpdate = undefined
  })
</script>

<ToolbarItem position="left">
  <div class="spark-controls-extension">
    <div bind:this={anchorEl} class="sc-anchor-wrapper">
      <ToolbarButton
        icon="mdiTune"
        label="Spark Controls"
        active={open}
        onclick={togglePanel}
      />
    </div>
  </div>
</ToolbarItem>

{#if open}
  <div
    bind:this={panelEl}
    use:portal
    class="sc-panel-tooltip"
    role="dialog"
    aria-modal="false"
    aria-labelledby="sc-panel-heading"
  >
    <h2 id="sc-panel-heading" class="sc-heading">Spark Controls</h2>
    {#if children}
      {@render children()}
    {/if}
  </div>
{/if}

<style>
  .sc-anchor-wrapper {
    display: inline-block;
  }

  :global(.sc-panel-tooltip) {
    position: fixed;
    top: 0;
    left: 0;
    min-width: 200px;
    max-height: 80vh;
    overflow-y: auto;
    background: #222;
    color: #e0e0e0;
    padding: 4px;
    border-radius: 3px;
    font-size: 11px;
    z-index: 1000;
  }
</style>
