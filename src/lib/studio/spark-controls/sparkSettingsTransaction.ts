/**
 * Production helper for building SparkControls settings transactions.
 *
 * Used by the SparkControlsExtension to commit field edits via
 * `transactions.buildTransaction()` with the correct shape for
 * source sync and undo/redo.
 */
import type { SparkControls } from '$lib/spark/SparkControls'
import type { ProfileSettings } from '$lib/spark/SparkControls'

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
