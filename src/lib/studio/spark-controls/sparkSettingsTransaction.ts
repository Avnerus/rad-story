/**
 * Production helper for building SparkControls settings transactions.
 *
 * Used by the SparkControlsExtension to commit field edits via
 * `transactions.buildTransaction()` with the correct shape for
 * source sync and undo/redo.
 */
import type { SparkControls, SparkSettings } from '$lib/spark/SparkControls'
import type { ProfileSettings } from '$lib/scenes/sceneObjects'

/**
 * Build a transaction object for committing a Spark settings edit.
 * The returned object matches the shape expected by
 * `transactions.buildTransaction()` from `@threlte/studio/extensions`.
 *
 * @deprecated Use `buildProfileSettingsTransaction` for profile-aware persistence.
 * Kept for backward compatibility with legacy `settings` attribute sync.
 */
export function buildSparkSettingsTransaction(
  controls: SparkControls,
  newSettings: SparkSettings,
  historicSettings: SparkSettings,
): {
  object: object
  propertyPath: string
  value: SparkSettings
  historicValue: SparkSettings
  createHistoryRecord: boolean
  sync: boolean
} {
  return {
    object: controls,
    propertyPath: 'settings',
    value: newSettings,
    historicValue: historicSettings,
    createHistoryRecord: true,
    sync: true,
  }
}

/**
 * Build a profile-aware transaction for committing Spark settings edits.
 * Persists the complete nested `profileSettings` object on the SparkControls `<T>`.
 *
 * @param controls - The SparkControls instance.
 * @param newProfileOverrides - The complete new profile overrides (both profiles).
 * @param historicProfileOverrides - The complete historic profile overrides.
 */
export function buildProfileSettingsTransaction(
  controls: SparkControls,
  newProfileOverrides: ProfileSettings,
  historicProfileOverrides: ProfileSettings,
): {
  object: object
  propertyPath: string
  value: ProfileSettings
  historicValue: ProfileSettings
  createHistoryRecord: boolean
  sync: boolean
} {
  return {
    object: controls,
    propertyPath: 'profileSettings',
    value: newProfileOverrides,
    historicValue: historicProfileOverrides,
    createHistoryRecord: true,
    sync: true,
  }
}

/**
 * Commit a settings transaction through the public transactions API.
 * Updates the UI settings snapshot and refreshes all draft values
 * to reflect any invariant adjustments.
 *
 * @returns The committed transaction, or null if source sync is unavailable.
 */
export function commitSparkSettingsTransaction(
  controls: SparkControls,
  newSettings: SparkSettings,
  historicSettings: SparkSettings,
  transactions: {
    vitePluginEnabled: boolean
    buildTransaction: (tx: object) => object
    commit: (txs: object[]) => void
  },
): object | null {
  if (!transactions.vitePluginEnabled) return null

  const tx = transactions.buildTransaction(
    buildSparkSettingsTransaction(controls, newSettings, historicSettings),
  )
  transactions.commit([tx])
  return tx
}
