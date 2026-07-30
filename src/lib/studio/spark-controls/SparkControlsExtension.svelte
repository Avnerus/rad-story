<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { useStudio } from '@threlte/studio/extend'
  import { useObjectSelection, useTransactions } from '@threlte/studio/extensions'
  import type { Object3D } from 'three'
  import { isSparkControls, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
  import { guardScrollAnimatorTransactions } from '$lib/studio/scroll-animator/transactionGuard'
  import type { SparkSettings, SparkControls } from '$lib/spark/SparkControls'
  import { SPARK_PAGE_SIZE } from '$lib/spark/SparkControls'
  import { buildSparkSettingsTransaction } from './sparkSettingsTransaction'
  import SparkFixedToolbarPane from './SparkFixedToolbarPane.svelte'

  interface FieldMeta {
    key: keyof SparkSettings
    label: string
    type: 'number' | 'boolean' | 'nullable-number'
    unit?: string
    help?: string
  }

  const FIELD_META: FieldMeta[] = [
    { key: 'lodSplatScale', label: 'LOD Splat Scale', type: 'number', help: 'LOD splat budget multiplier' },
    { key: 'lodRenderScale', label: 'LOD Render Scale', type: 'number', help: 'Min projected LOD splat size' },
    { key: 'maxStdDev', label: 'Max Std Dev', type: 'number', help: 'Gaussian extent/quality bound' },
    { key: 'maxPagedSplats', label: 'Max Paged Splats', type: 'number', unit: 'splats', help: `Pager capacity (multiple of ${SPARK_PAGE_SIZE.toLocaleString()}). Triggers mesh reload.` },
    { key: 'coneFov0', label: 'Cone FOV 0', type: 'number', unit: '°', help: 'Full-detail cone angle (degrees)' },
    { key: 'coneFov', label: 'Cone FOV', type: 'number', unit: '°', help: 'Reduced-detail cone angle (degrees)' },
    { key: 'coneFoveate', label: 'Cone Foveate', type: 'number', help: 'Detail scale at coneFov' },
    { key: 'behindFoveate', label: 'Behind Foveate', type: 'number', help: 'Detail scale behind viewer' },
    { key: 'minPixelRadius', label: 'Min Pixel Radius', type: 'number', unit: 'px' },
    { key: 'maxPixelRadius', label: 'Max Pixel Radius', type: 'number', unit: 'px' },
    { key: 'minAlpha', label: 'Min Alpha', type: 'number' },
    { key: 'preBlurAmount', label: 'Pre-Blur', type: 'number' },
    { key: 'blurAmount', label: 'Blur Amount', type: 'number' },
    { key: 'falloff', label: 'Falloff', type: 'number' },
    { key: 'clipXY', label: 'Clip XY', type: 'number', help: 'Draw clipping factor (not LOD cutoff)' },
    { key: 'focalAdjustment', label: 'Focal Adj', type: 'number' },
    { key: 'sortRadial', label: 'Sort Radial', type: 'boolean' },
    { key: 'minSortIntervalMs', label: 'Min Sort Interval', type: 'number', unit: 'ms' },
    { key: 'enableLod', label: 'Enable LOD', type: 'boolean' },
    { key: 'enableLodFetching', label: 'Enable LOD Fetching', type: 'boolean' },
    { key: 'lodSplatCount', label: 'LOD Splat Count', type: 'nullable-number', help: 'null = automatic' },
    { key: 'lodInflate', label: 'LOD Inflate', type: 'boolean' },
  ]

  let { children }: { children?: Snippet } = $props()

  const { createExtension } = useStudio()
  const objectSelection = useObjectSelection()
  const transactions = useTransactions()

  createExtension({
    scope: 'spark-controls',
    state: ({ persist }) => ({
      paneVisible: persist<boolean>(false),
    }),
    actions: {},
  })

  // Transaction guard: suppress source sync for SparkControls transforms
  let unsubscribeGuard: (() => void) | undefined

  // Reactive derived values from selection
  const selectedObjects = $derived(objectSelection.selectedObjects ?? [])
  const singleSpark = $derived<Object3D | null>(
    selectedObjects.length === 1 && isSparkControls(selectedObjects[0])
      ? selectedObjects[0]
      : null,
  )

  // UI state
  let uiState = $state({
    controls: null as SparkControls | null,
    settings: {} as SparkSettings,
    reloading: false,
    reloadError: '' as string,
  })

  // Local draft values for editing
  let drafts = $state<Record<string, string>>({})

  // Reload status subscription — clean up on selection change / destroy
  let unsubscribeReloadStatus: (() => void) | null = null

  /** Subscribe to reload status from the selected SparkControls. */
  function subscribeToReloadStatus(controls: SparkControls): void {
    unsubscribeReloadStatus?.()
    // Initialize from current values immediately (catches mid-reload selection)
    uiState.reloading = controls.reloadStatus.isReloading
    uiState.reloadError = controls.reloadStatus.error
    // Then subscribe for future changes
    unsubscribeReloadStatus = controls.reloadStatus.subscribe((status) => {
      uiState.reloading = status.isReloading
      uiState.reloadError = status.error
    })
  }

  /** Unsubscribe from reload status. */
  function unsubscribeFromReloadStatus(): void {
    unsubscribeReloadStatus?.()
    unsubscribeReloadStatus = null
    uiState.reloading = false
    uiState.reloadError = ''
  }

  // Keep settings in sync with selection
  let revision = $state(0)
  $effect(() => {
    const ctrl = singleSpark
    const rev = revision
    void rev
    if (ctrl && isSparkControls(ctrl)) {
      const sc = ctrl as unknown as SparkControls
      uiState.controls = sc
      uiState.settings = sc.settings
      // Subscribe to reload status reactively
      subscribeToReloadStatus(sc)
      // Initialize drafts from current settings
      const newDrafts: Record<string, string> = {}
      for (const meta of FIELD_META) {
        const val = sc.settings[meta.key]
        newDrafts[meta.key] = val === null ? '' : String(val)
      }
      drafts = newDrafts
    } else {
      uiState.controls = null
      uiState.settings = {} as SparkSettings
      // Unsubscribe from reload status when no Spark is selected
      unsubscribeFromReloadStatus()
    }
  })

  onMount(() => {
    unsubscribeGuard = transactions.onTransaction((txs) => {
      guardScrollAnimatorTransactions(txs as GuardTransaction[])
      revision += 1
    })
  })

  onDestroy(() => {
    unsubscribeGuard?.()
    unsubscribeFromReloadStatus()
  })

  // Commit a field edit via transaction
  function handleFieldChange(meta: FieldMeta): void {
    const controls = uiState.controls
    if (!controls) return

    const draft = drafts[meta.key]
    let raw: unknown

    if (meta.type === 'boolean') {
      return
    } else if (meta.type === 'nullable-number') {
      raw = draft === '' ? null : Number(draft)
    } else {
      raw = Number(draft)
    }

    const key = meta.key
    const ctrl = controls as unknown as Record<string, unknown>
    const currentValue = ctrl[key]

    // Validate through the setter
    ctrl[key] = raw

    const newValue = ctrl[key]

    if (currentValue !== newValue) {
      // If source sync is available, commit as a transaction
      if (transactions.vitePluginEnabled) {
        const tx = transactions.buildTransaction(
          buildSparkSettingsTransaction(controls, controls.settings, uiState.settings),
        )
        transactions.commit([tx])
      }
      uiState.settings = controls.settings
      // Refresh all drafts from new settings (invariant may have changed other fields)
      for (const m of FIELD_META) {
        const val = controls.settings[m.key]
        drafts[m.key] = val === null ? '' : String(val)
      }
    }
  }

  function handleBooleanChange(meta: FieldMeta, checked: boolean): void {
    const controls = uiState.controls
    if (!controls) return

    const key = meta.key
    const ctrl = controls as unknown as Record<string, unknown>
    const currentValue = ctrl[key]

    ctrl[key] = checked
    const newValue = ctrl[key]

    if (currentValue !== newValue) {
      if (transactions.vitePluginEnabled) {
        const tx = transactions.buildTransaction(
          buildSparkSettingsTransaction(controls, controls.settings, uiState.settings),
        )
        transactions.commit([tx])
      }
      uiState.settings = controls.settings
      // Refresh all drafts (invariant may have changed other fields)
      for (const m of FIELD_META) {
        const val = controls.settings[m.key]
        drafts[m.key] = val === null ? '' : String(val)
      }
    }
  }

  function handleBlur(meta: FieldMeta): void {
    handleFieldChange(meta)
  }

  function handleKeyDown(meta: FieldMeta, e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleFieldChange(meta)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  function handleInput(meta: FieldMeta, e: Event): void {
    drafts[meta.key] = (e.target as HTMLInputElement).value
  }

  function handleCheckboxChange(meta: FieldMeta, e: Event): void {
    handleBooleanChange(meta, (e.target as HTMLInputElement).checked)
  }
</script>

<SparkFixedToolbarPane>
  {#if !uiState.controls}
    <div class="sc-no-selection" data-testid="spark-no-selection">Select the Spark object</div>
  {:else}
    <div class="sc-panel" data-testid="spark-controls-panel">
      <div class="sc-title">Spark Controls</div>

      {#if !transactions.vitePluginEnabled}
        <div class="sc-warning" data-testid="spark-sync-warning">Studio source sync unavailable — edits apply live but won't persist</div>
      {/if}

      {#if uiState.reloading}
        <div class="sc-reloading" data-testid="spark-reloading">Reloading mesh…</div>
      {/if}
      {#if uiState.reloadError}
        <div class="sc-error" data-testid="spark-error">{uiState.reloadError}</div>
      {/if}

      <div class="sc-fields">
        {#each FIELD_META as meta}
          <div class="sc-field" data-testid={`spark-field-${meta.key}`}>
            <label class="sc-label" title={meta.help || meta.label} for={`spark-${meta.key}`}>
              {meta.label}
              {#if meta.unit} <span class="sc-unit">{meta.unit}</span>{/if}
            </label>
            {#if meta.type === 'boolean'}
              <input
                id={`spark-${meta.key}`}
                type="checkbox"
                class="sc-checkbox"
                checked={uiState.settings[meta.key] as boolean}
                onchange={(e) => handleCheckboxChange(meta, e)}
              />
            {:else if meta.type === 'nullable-number'}
              <input
                id={`spark-${meta.key}`}
                type="text"
                class="sc-input"
                value={drafts[meta.key] ?? ''}
                placeholder="auto"
                oninput={(e) => handleInput(meta, e)}
                onblur={() => handleBlur(meta)}
                onkeydown={(e) => handleKeyDown(meta, e)}
              />
            {:else}
              <input
                id={`spark-${meta.key}`}
                type="number"
                class="sc-input"
                value={drafts[meta.key] ?? String(uiState.settings[meta.key])}
                oninput={(e) => handleInput(meta, e)}
                onblur={() => handleBlur(meta)}
                onkeydown={(e) => handleKeyDown(meta, e)}
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</SparkFixedToolbarPane>

{@render children?.()}

<style>
  .sc-no-selection {
    padding: 8px;
    color: #888;
    font-size: 12px;
  }

  .sc-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
  }

  .sc-title {
    font-weight: 600;
    font-size: 12px;
    color: #ccc;
    margin-bottom: 2px;
  }

  .sc-warning {
    color: #f0ad4e;
    font-size: 11px;
    font-style: italic;
    margin-bottom: 4px;
  }

  .sc-reloading {
    color: #6366f1;
    font-size: 11px;
    font-style: italic;
  }

  .sc-error {
    color: #ef4444;
    font-size: 11px;
  }

  .sc-fields {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .sc-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 11px;
    background: #2a2a2a;
  }

  .sc-label {
    color: #aaa;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sc-unit {
    color: #666;
    font-size: 10px;
  }

  .sc-input {
    width: 70px;
    padding: 1px 3px;
    font-size: 11px;
    background: #333;
    color: #e0e0e0;
    border: 1px solid #555;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .sc-checkbox {
    flex-shrink: 0;
  }
</style>
