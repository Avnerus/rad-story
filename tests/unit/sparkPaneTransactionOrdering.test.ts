import { describe, test, expect, beforeEach } from 'vitest'
import { SparkControls, type SparkSettings } from '$lib/spark/SparkControls'

/**
 * Tests for the Spark Controls pane's transaction snapshot ordering.
 *
 * SparkControls.onChange() fires synchronously inside its setters. The pane's
 * onChange subscription refreshes uiState.settings to the new state before the
 * pane builds its transaction. These tests verify the correct pattern:
 *
 *   const historicSettings = controls.settings  // BEFORE setter
 *   ctrl[key] = raw                             // fires onChange → refreshes pane
 *   const newSettings = controls.settings       // AFTER setter
 *   buildSparkSettingsTransaction(controls, newSettings, historicSettings)
 *
 * This ensures historicValue !== value even though the synchronous onChange
 * callback has already updated the pane's state.
 */

describe('Pane transaction snapshot ordering', () => {
  let ctrl: SparkControls

  beforeEach(() => {
    ctrl = new SparkControls()
  })

  test('numeric edit: historicValue has old value, value has new value', () => {
    // Simulate pane's onChange subscription refreshing uiState
    let paneSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    // Pane edit: capture historic BEFORE setter
    const historicSettings = ctrl.settings

    // Setter fires onChange synchronously → paneSettings updated
    ctrl.lodSplatScale = 5

    // Capture new AFTER setter
    const newSettings = ctrl.settings

    // Verify historicValue has old value
    expect(historicSettings.lodSplatScale).toBe(1, 'historic has default')
    // Verify value has new value
    expect(newSettings.lodSplatScale).toBe(5, 'new has edited value')
    // Verify pane was updated by synchronous onChange
    expect(paneSettings.lodSplatScale).toBe(5, 'pane refreshed by onChange')
    // Verify historicValue and value are distinct
    expect(historicSettings).not.toBe(newSettings, 'distinct snapshots')
    expect(historicSettings.lodSplatScale).not.toBe(newSettings.lodSplatScale)
  })

  test('boolean edit: historicValue has old value, value has new value', () => {
    let paneSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    const historicSettings = ctrl.settings
    ctrl.sortRadial = false
    const newSettings = ctrl.settings

    expect(historicSettings.sortRadial).toBe(true, 'historic has default')
    expect(newSettings.sortRadial).toBe(false, 'new has edited value')
    expect(paneSettings.sortRadial).toBe(false, 'pane refreshed by onChange')
  })

  test('nullable edit: historicValue has old value, value has new value', () => {
    let paneSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    const historicSettings = ctrl.settings
    ctrl.lodSplatCount = 50000
    const newSettings = ctrl.settings

    expect(historicSettings.lodSplatCount).toBeNull('historic has default null')
    expect(newSettings.lodSplatCount).toBe(50000, 'new has edited value')
    expect(paneSettings.lodSplatCount).toBe(50000, 'pane refreshed by onChange')
  })

  test('coupled invariant edit: only new snapshot has adjusted field', () => {
    let paneSettings: SparkSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    const historicSettings = ctrl.settings
    ctrl.coneFov0 = 170 // raises coneFov from 120 to 170
    const newSettings = ctrl.settings

    expect(historicSettings.coneFov0).toBe(90, 'historic has default coneFov0')
    expect(historicSettings.coneFov).toBe(120, 'historic has default coneFov')
    expect(newSettings.coneFov0).toBe(170, 'new has edited coneFov0')
    expect(newSettings.coneFov).toBe(170, 'new has adjusted coneFov')
    expect(paneSettings.coneFov).toBe(170, 'pane refreshed both fields')
  })

  test('unchanged edit: no transaction should be created', () => {
    let changeCount = 0

    ctrl.onChange(() => {
      changeCount++
    })

    const historicSettings = ctrl.settings
    ctrl.lodSplatScale = 1 // same as default
    const newSettings = ctrl.settings

    expect(historicSettings.lodSplatScale).toBe(newSettings.lodSplatScale, 'values equal')
    expect(changeCount).toBe(0, 'onChange not fired for unchanged value')
  })

  test('settings setter: historic and value are distinct', () => {
    let paneSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    const historicSettings = ctrl.settings
    ctrl.settings = { lodSplatScale: 3, blurAmount: 0.7 }
    const newSettings = ctrl.settings

    expect(historicSettings.lodSplatScale).toBe(1, 'historic has default')
    expect(historicSettings.blurAmount).toBe(0.3, 'historic has default')
    expect(newSettings.lodSplatScale).toBe(3, 'new has edited lodSplatScale')
    expect(newSettings.blurAmount).toBe(0.7, 'new has edited blurAmount')
    expect(paneSettings.lodSplatScale).toBe(3, 'pane refreshed by onChange')
    expect(paneSettings.blurAmount).toBe(0.7, 'pane refreshed by onChange')
  })

  test('sequential edits: each transaction has correct historic/value', () => {
    const transactions: Array<{ historic: SparkSettings; value: SparkSettings }> = []
    let paneSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    // Edit 1
    const hist1 = ctrl.settings
    ctrl.lodSplatScale = 2
    const val1 = ctrl.settings
    transactions.push({ historic: hist1, value: val1 })

    // Edit 2
    const hist2 = ctrl.settings
    ctrl.blurAmount = 0.5
    const val2 = ctrl.settings
    transactions.push({ historic: hist2, value: val2 })

    // Verify edit 1
    expect(transactions[0].historic.lodSplatScale).toBe(1)
    expect(transactions[0].value.lodSplatScale).toBe(2)
    // Verify edit 2's historic has edit 1's value
    expect(transactions[1].historic.lodSplatScale).toBe(2)
    expect(transactions[1].historic.blurAmount).toBe(0.3)
    expect(transactions[1].value.blurAmount).toBe(0.5)
    // Pane is current
    expect(paneSettings.lodSplatScale).toBe(2)
    expect(paneSettings.blurAmount).toBe(0.5)
  })

  test('undo/redo simulation: settings setter restores pre-edit state', () => {
    // Simulate: edit → undo → redo
    let paneSettings = ctrl.settings

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
    })

    // Edit: lodSplatScale 1 → 5
    const hist = ctrl.settings
    ctrl.lodSplatScale = 5
    const newVal = ctrl.settings
    expect(newVal.lodSplatScale).toBe(5)

    // Undo: restore historicSettings via settings setter
    ctrl.settings = hist
    expect(ctrl.settings.lodSplatScale).toBe(1, 'undo restored pre-edit value')
    expect(paneSettings.lodSplatScale).toBe(1, 'pane refreshed by undo')

    // Redo: restore newSettings via settings setter
    ctrl.settings = newVal
    expect(ctrl.settings.lodSplatScale).toBe(5, 'redo restored post-edit value')
    expect(paneSettings.lodSplatScale).toBe(5, 'pane refreshed by redo')
  })

  test('pane onChange subscription continues working after pane-originated edits', () => {
    let paneSettings = ctrl.settings
    let changeCount = 0

    ctrl.onChange(() => {
      paneSettings = ctrl.settings
      changeCount++
    })

    // Pane-originated edit
    const hist = ctrl.settings
    ctrl.lodSplatScale = 3
    const newVal = ctrl.settings

    expect(changeCount).toBe(1, 'onChange fired for pane edit')
    expect(paneSettings.lodSplatScale).toBe(3, 'pane refreshed')

    // External change (e.g., Inspector)
    ctrl.blurAmount = 0.8
    expect(changeCount).toBe(2, 'onChange fired for external edit')
    expect(paneSettings.blurAmount).toBe(0.8, 'pane refreshed by external edit')

    // Verify transaction snapshots were correct
    expect(hist.lodSplatScale).toBe(1)
    expect(newVal.lodSplatScale).toBe(3)
  })
})

describe('Stale-controller guard with synchronous onChange', () => {
  test('old controller onChange does not overwrite pane bound to new controller', () => {
    const ctrlA = new SparkControls()
    const ctrlB = new SparkControls()

    let activeControls: SparkControls | null = ctrlA
    let paneSettings = ctrlA.settings

    const unsubA = ctrlA.onChange(() => {
      if (activeControls !== ctrlA) return
      paneSettings = ctrlA.settings
    })

    // Switch to B
    activeControls = ctrlB
    paneSettings = ctrlB.settings
    unsubA()

    const unsubB = ctrlB.onChange(() => {
      if (activeControls !== ctrlB) return
      paneSettings = ctrlB.settings
    })

    // Change via A (old, unsubscribed) — should NOT affect pane
    ctrlA.lodSplatScale = 8
    const newValA = ctrlA.settings
    expect(newValA.lodSplatScale).toBe(8)
    expect(paneSettings.lodSplatScale).not.toBe(8, 'pane not affected by old controller')

    // Change via B (current) — should affect pane
    ctrlB.lodSplatScale = 7
    expect(paneSettings.lodSplatScale).toBe(7, 'pane affected by current controller')

    unsubB()
  })
})
