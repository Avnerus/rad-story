<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { useStudio } from '@threlte/studio/extend'
  import { useTransactions } from '@threlte/studio/extensions'
  import type { SparkSettings, SparkControls } from '$lib/spark/SparkControls'
  import { SPARK_PAGE_SIZE, SETTINGS_KEYS } from '$lib/spark/SparkControls'
  import { activeSparkControlsRuntime } from './activeSparkControlsRuntime'
  import { guardScrollAnimatorTransactions, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
  import SparkFixedToolbarPane from './SparkFixedToolbarPane.svelte'
  import type { DeviceProfileName } from '$lib/types'
  import type { ProfileSettings } from '$lib/scenes/sceneObjects'
  import { getGlobalBaseline } from '$lib/spark/deviceProfile'

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

  // Reactive state driven by the active Spark Controls runtime
  let uiState = $state({
    controls: null as SparkControls | null,
    settings: {} as SparkSettings,
    profileName: 'desktop' as DeviceProfileName,
    reloading: false,
    reloadError: '' as string,
  })

  // Scene-local profile overrides — managed via source sync on the <T> attribute.
  // For file-backed scenes, this is the source of truth for persistence.
  // For ad-hoc scenes, edits are transient (no source sync target).
  let profileOverrides = $state<ProfileSettings>({ desktop: {}, mobile: {} })

  // Local draft values for editing
  let drafts = $state<Record<string, string>>({})

  // Reload status subscription — clean up when active controller changes or extension is destroyed
  let unsubscribeReloadStatus: (() => void) | null = null

  // Settings-change subscription — keeps pane in sync with external edits (undo/redo, Inspector, programmatic)
  let unsubscribeSettings: (() => void) | null = null

  /** Subscribe to reload status from the given SparkControls. */
  function subscribeToReloadStatus(controls: SparkControls): void {
    unsubscribeReloadStatus?.()
    // Initialize from current values immediately (catches mid-reload transitions)
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

  /** Subscribe to settings changes from the given SparkControls. */
  function subscribeToSettings(controls: SparkControls): void {
    unsubscribeSettings?.()
    unsubscribeSettings = controls.onChange(() => {
      // Stale-controller guard: ignore if a newer controller has taken over
      if (uiState.controls !== controls) return
      uiState.settings = controls.settings
      refreshDrafts(controls)
    })
  }

  /** Unsubscribe from settings changes. */
  function unsubscribeFromSettings(): void {
    unsubscribeSettings?.()
    unsubscribeSettings = null
  }

  /** Initialize drafts from the current settings. */
  function initDrafts(settings: SparkSettings): void {
    const newDrafts: Record<string, string> = {}
    for (const meta of FIELD_META) {
      const val = settings[meta.key]
      newDrafts[meta.key] = val === null ? '' : String(val)
    }
    drafts = newDrafts
  }

  /** Refresh all drafts from current settings (after an edit that may trigger invariants). */
  function refreshDrafts(controls: SparkControls): void {
    for (const m of FIELD_META) {
      const val = controls.settings[m.key]
      drafts[m.key] = val === null ? '' : String(val)
    }
  }

  /**
   * Compute the effective profile settings for the active profile from
   * the current scene overrides. Used to initialize profileOverrides
   * when the active controller changes (e.g. for ad-hoc scenes or when
   * source sync hasn't set them yet).
   */
  function computeProfileOverridesFromSettings(): ProfileSettings {
    const activeProfile = uiState.profileName
    const baseline = getGlobalBaseline(activeProfile)
    const currentSettings = uiState.controls?.settings ?? ({} as SparkSettings)

    // Compute overrides for active profile
    const activeOverrides: Record<string, SparkSettings[keyof SparkSettings]> = {}
    for (const key of SETTINGS_KEYS) {
      if (currentSettings[key] !== baseline[key]) {
        activeOverrides[key] = currentSettings[key]
      }
    }

    // Preserve existing overrides for the inactive profile
    const inactiveProfile: DeviceProfileName = activeProfile === 'desktop' ? 'mobile' : 'desktop'
    const inactiveOverrides = profileOverrides[inactiveProfile] ?? {}

    return {
      desktop: activeProfile === 'desktop' ? activeOverrides : inactiveOverrides as Partial<SparkSettings>,
      mobile: activeProfile === 'mobile' ? activeOverrides : inactiveOverrides as Partial<SparkSettings>,
    }
  }

  // Subscribe to active controller changes from the runtime
  let unsubscribeActive: (() => void) | null = null

  onMount(() => {
    // Transaction guard for source sync
    unsubscribeGuard = transactions.onTransaction((txs) => {
      guardScrollAnimatorTransactions(txs as GuardTransaction[])
    })

    // Subscribe to active SparkControls changes
    const current = activeSparkControlsRuntime.activeController
    const profileName = activeSparkControlsRuntime.profileName
    if (current) {
      uiState.controls = current
      uiState.settings = current.settings
      uiState.profileName = profileName
      subscribeToReloadStatus(current)
      subscribeToSettings(current)
      initDrafts(current.settings)
      // Initialize profile overrides from current settings
      profileOverrides = computeProfileOverridesFromSettings()
    } else {
      uiState.controls = null
      uiState.settings = {} as SparkSettings
    }

    unsubscribeActive = activeSparkControlsRuntime.onChange((controls) => {
      if (controls) {
        // Unsubscribe from old controller before binding to new one
        unsubscribeFromSettings()
        unsubscribeFromReloadStatus()
        uiState.controls = controls
        uiState.settings = controls.settings
        uiState.profileName = activeSparkControlsRuntime.profileName
        subscribeToReloadStatus(controls)
        subscribeToSettings(controls)
        initDrafts(controls.settings)
        // Initialize profile overrides from current settings
        profileOverrides = computeProfileOverridesFromSettings()
      } else {
        uiState.controls = null
        uiState.settings = {} as SparkSettings
        unsubscribeFromSettings()
        unsubscribeFromReloadStatus()
      }
    })
  })

  onDestroy(() => {
    unsubscribeGuard?.()
    unsubscribeActive?.()
    unsubscribeFromSettings()
    unsubscribeFromReloadStatus()
  })

  /**
   * Build the complete nested profileSettings object after a field edit.
   * Captures historic snapshot BEFORE mutation (onChange fires synchronously),
   * then computes the new overrides AFTER mutation.
   */
  function buildNewProfileOverrides(
    controls: SparkControls,
    newSettings: SparkSettings,
  ): ProfileSettings {
    const activeProfile = uiState.profileName
    const baseline = getGlobalBaseline(activeProfile)

    // Compute new overrides for active profile
    const newActiveOverrides: Record<string, SparkSettings[keyof SparkSettings]> = {}
    for (const key of SETTINGS_KEYS) {
      if (newSettings[key] !== baseline[key]) {
        newActiveOverrides[key] = newSettings[key]
      }
    }

    // Preserve existing overrides for the inactive profile
    const inactiveProfile: DeviceProfileName = activeProfile === 'desktop' ? 'mobile' : 'desktop'
    const inactiveOverrides = profileOverrides[inactiveProfile] ?? {}

    return {
      desktop: activeProfile === 'desktop' ? newActiveOverrides : inactiveOverrides as Partial<SparkSettings>,
      mobile: activeProfile === 'mobile' ? newActiveOverrides : inactiveOverrides as Partial<SparkSettings>,
    }
  }

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

    // Capture historic snapshot BEFORE mutation (onChange fires synchronously)
    const historicSettings = controls.settings
    const historicProfileOverrides = JSON.parse(JSON.stringify(profileOverrides))

    // Validate through the setter (fires onChange → refreshes uiState.settings)
    ctrl[key] = raw

    // Capture new snapshot AFTER mutation (includes coupled invariant changes)
    const newSettings = controls.settings

    // Check if any field actually changed
    if (historicSettings[key] === newSettings[key]) return

    // If source sync is available, commit as a transaction on profileSettings
    if (transactions.vitePluginEnabled) {
      const newProfileOverrides = buildNewProfileOverrides(controls, newSettings)
      const tx = transactions.buildTransaction({
        object: controls,
        propertyPath: 'profileSettings',
        value: newProfileOverrides,
        historicValue: historicProfileOverrides,
        createHistoryRecord: true,
        sync: true,
      })
      transactions.commit([tx])
      // Update local state
      profileOverrides = newProfileOverrides
    }
    // uiState.settings already refreshed by the synchronous onChange callback
  }

  function handleBooleanChange(meta: FieldMeta, checked: boolean): void {
    const controls = uiState.controls
    if (!controls) return

    const key = meta.key
    const ctrl = controls as unknown as Record<string, unknown>

    // Capture historic snapshot BEFORE mutation (onChange fires synchronously)
    const historicSettings = controls.settings
    const historicProfileOverrides = JSON.parse(JSON.stringify(profileOverrides))

    // Validate through the setter (fires onChange → refreshes uiState.settings)
    ctrl[key] = checked

    // Capture new snapshot AFTER mutation (includes coupled invariant changes)
    const newSettings = controls.settings

    // Check if any field actually changed
    if (historicSettings[key] === newSettings[key]) return

    // If source sync is available, commit as a transaction on profileSettings
    if (transactions.vitePluginEnabled) {
      const newProfileOverrides = buildNewProfileOverrides(controls, newSettings)
      const tx = transactions.buildTransaction({
        object: controls,
        propertyPath: 'profileSettings',
        value: newProfileOverrides,
        historicValue: historicProfileOverrides,
        createHistoryRecord: true,
        sync: true,
      })
      transactions.commit([tx])
      // Update local state
      profileOverrides = newProfileOverrides
    }
    // uiState.settings already refreshed by the synchronous onChange callback
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
    <div class="sc-no-selection" data-testid="spark-no-selection">No scene loaded</div>
  {:else}
    <div class="sc-panel" data-testid="spark-controls-panel">
      <div class="sc-title">
        Spark Controls
        <span class="sc-profile-badge" data-testid="spark-profile-badge">
          {uiState.profileName === 'desktop' ? 'Desktop' : 'Mobile'}
        </span>
      </div>

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
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sc-profile-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 5px;
    border-radius: 3px;
    background: #3b82f6;
    color: #fff;
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
