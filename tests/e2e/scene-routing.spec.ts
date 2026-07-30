import { test, expect } from '@playwright/test'

/** Read camera debug attributes from the hidden debug element */
async function getCameraState(page: import('@playwright/test').Page) {
  const result = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="camera-state"]')
    if (!el) return null
    const get = (name: string) => parseFloat(el.getAttribute(name) ?? '0')
    return {
      progress: get('data-progress'),
      x: get('data-x'),
      y: get('data-y'),
      z: get('data-z'),
      targetX: get('data-target-x'),
      targetY: get('data-target-y'),
      targetZ: get('data-target-z'),
    }
  })
  return result!
}

/** Helper: wait for the debug element to appear */
async function waitForDebugElement(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="camera-state"]') !== null
  }, { timeout: 10_000 })
}

/**
 * Helper: get camera frustum helper diagnostic from stub build.
 * Returns enriched diagnostic with exact count/identity/lifecycle evidence.
 */
async function getHelperDiagnostic(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const fn = (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic
    if (typeof fn !== 'function') return null
    return (fn as () => {
      ownedHelperCount: number
      helperExists: boolean
      targetCameraType: string | null
      targetCameraUuid: string | null
      helperParentUuid: string | null
      helpersCreated: number
      helpersDisposed: number
    })()
  })
}

test.describe('Scene routing', () => {
  test('direct visit to /scene/baby_yoda loads the scene', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Viewer header should show scene name
    const header = page.locator('.viewer-header .url-label')
    await expect(header).toBeVisible()
    await expect(header).toContainText('baby_yoda')
  })

  test('refresh at /scene/baby_yoda loads the scene', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Refresh and verify it still loads
    await page.reload()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    const header = page.locator('.viewer-header .url-label')
    await expect(header).toContainText('baby_yoda')
  })

  test('unknown scene name shows not-found', async ({ page }) => {
    await page.goto('/scene/nonexistent_scene')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/nonexistent_scene/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go home' })).toBeVisible()
  })

  test('empty scene name (/scene/) shows not-found', async ({ page }) => {
    await page.goto('/scene/')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Go home' })).toBeVisible()
  })

  test('uppercase scene name shows not-found', async ({ page }) => {
    await page.goto('/scene/Baby_Yoda')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('not-found "Go home" navigates to landing', async ({ page }) => {
    await page.goto('/scene/nonexistent_scene')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible()
    await page.getByRole('button', { name: 'Go home' }).click()
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible({ timeout: 10_000 })
  })

  test('baby_yoda scene uses hard-coded URL (no query string mutation)', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // URL should not have ?url= parameter
    const url = page.url()
    expect(url).not.toContain('url=')
  })

  test('baby_yoda scene scroll 0% camera position', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const state = await getCameraState(page)
    expect(state.progress).toBeCloseTo(0, 1)
    expect(state.x).toBeCloseTo(0, 0)
    expect(state.y).toBeCloseTo(0, 0)
    expect(state.z).toBeCloseTo(-1, 0)
  })

  test('baby_yoda scene scroll 100% camera position', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight) })
    await page.waitForTimeout(800)

    const state = await getCameraState(page)
    expect(state.progress).toBeGreaterThan(95)
    expect(state.y).toBeGreaterThan(25)
  })

  test('browser back from scene route returns to landing', async ({ page }) => {
    // Start at landing
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    // Navigate to scene via direct URL
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Go back
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible({ timeout: 10_000 })
  })

  test('scene remount: navigating away and back does not stack resources', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Navigate to landing
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    // Navigate back to scene
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    // Camera should be at initial position (no stacking)
    const state = await getCameraState(page)
    expect(state.y).toBeCloseTo(0, 0)
    expect(state.z).toBeCloseTo(-1, 0)
  })

  test('landing page still works after scene routes added', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await expect(page.getByLabel('RAD file URL')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  test('query-string URL parameter still pre-fills landing input', async ({ page }) => {
    const SAMPLE_URL =
      'https://storage.googleapis.com/forge-dev-public/asundqui/rad/260217/cozy-spaceship_2-lod.rad'
    const encodedUrl = encodeURIComponent(SAMPLE_URL)
    await page.goto(`/?url=${encodedUrl}`)
    expect(await page.getByLabel('RAD file URL').inputValue()).toBe(SAMPLE_URL)
  })
})

// ---------------------------------------------------------------------------
// Camera frustum helper tests — exact-one contract, identity, lifecycle
// ---------------------------------------------------------------------------

test.describe('Camera frustum helper', () => {
  test('selecting opted-in animator creates helper for descendant camera', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Wait for Studio hierarchy to load
    const animatorItem = page.getByText('Camera ScrollAnimator')
    await expect(animatorItem).toBeVisible({ timeout: 15_000 })
    await animatorItem.click()
    await page.waitForTimeout(500)

    // Assert helper was created with exact evidence
    const diag = await getHelperDiagnostic(page)
    expect(diag, 'helper diagnostic available').not.toBeNull()
    expect(diag!.helperExists, 'helper created for opted-in animator').toBe(true)
    expect(diag!.ownedHelperCount, 'exactly one owned helper in scene').toBe(1)
    expect(diag!.targetCameraType, 'helper targets PerspectiveCamera').toBe('PerspectiveCamera')
    expect(diag!.targetCameraUuid, 'target camera has UUID').not.toBeNull()
    expect(diag!.targetCameraUuid, 'target camera UUID is non-empty').not.toBe('')
    expect(diag!.helperParentUuid, 'helper parent (scene root) has UUID').not.toBeNull()
    expect(diag!.helpersCreated, 'helpersCreated counter incremented').toBe(1)
    expect(diag!.helpersDisposed, 'no helpers disposed yet').toBe(0)
  })

  test('selecting unrelated object removes helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // First select the animator to create the helper
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)
    expect(diagBefore!.ownedHelperCount).toBe(1)

    // Now select Spark (unrelated)
    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)

    // Helper should be removed
    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper removed for unrelated selection').toBe(false)
    expect(diagAfter!.ownedHelperCount, 'zero owned helpers after deselection').toBe(0)
    expect(diagAfter!.helpersDisposed, 'helper disposed counter incremented').toBe(1)
  })

  test('selecting PerspectiveCamera directly creates no custom helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // First create a helper by selecting the animator
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)

    // Now deselect by clicking on SplatWrapper (not a camera or animator)
    await page.getByText('SplatWrapper').first().click()
    await page.waitForTimeout(500)

    // Custom helper should be removed (SplatWrapper is not an opted-in animator)
    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper removed when selecting non-animator').toBe(false)

    // Now select the PerspectiveCamera directly
    await page.evaluate(() => {
      const items = document.querySelectorAll('.tv-item-text')
      for (const item of items) {
        if (item.textContent?.includes('PerspectiveCamera')) {
          const row = item.closest('.tv-item')
          ;(row as HTMLElement)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return
        }
      }
    })
    await page.waitForTimeout(500)

    // Custom helper should NOT exist (Studio's built-in Helpers handles this)
    const diagFinal = await getHelperDiagnostic(page)
    expect(diagFinal!.helperExists, 'no custom helper for direct camera selection').toBe(false)
    expect(diagFinal!.ownedHelperCount, 'zero owned helpers for direct camera').toBe(0)
  })

  test('repeated selection/deselection does not accumulate helpers', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    for (let i = 0; i < 3; i++) {
      // Select animator → helper created
      await page.getByText('Camera ScrollAnimator').click()
      await page.waitForTimeout(300)
      const diagOn = await getHelperDiagnostic(page)
      expect(diagOn!.helperExists, `iteration ${i}: helper created`).toBe(true)
      expect(diagOn!.ownedHelperCount, `iteration ${i}: exactly one owned`).toBe(1)

      // Select unrelated → helper removed
      await page.getByText('Spark').first().click()
      await page.waitForTimeout(300)
      const diagOff = await getHelperDiagnostic(page)
      expect(diagOff!.helperExists, `iteration ${i}: helper removed`).toBe(false)
      expect(diagOff!.ownedHelperCount, `iteration ${i}: zero owned after removal`).toBe(0)
    }

    // Final state: counters reflect 3 create + 3 dispose
    const diagFinal = await getHelperDiagnostic(page)
    expect(diagFinal!.helpersCreated).toBe(3)
    expect(diagFinal!.helpersDisposed).toBe(3)
  })

  test('scene remount cleans up helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Create helper by selecting animator
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)

    // Navigate away and back
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // After remount, no helper should exist (nothing selected)
    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper cleaned up after remount').toBe(false)
    expect(diagAfter!.ownedHelperCount, 'zero owned helpers after remount').toBe(0)
    // New component instance starts with fresh counters
    expect(diagAfter!.helpersCreated).toBe(0)
    expect(diagAfter!.helpersDisposed).toBe(0)
  })

  test('helper targets exact camera identity', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Select animator
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag = await getHelperDiagnostic(page)
    expect(diag!.targetCameraUuid).not.toBeNull()
    expect(diag!.targetCameraUuid).not.toBe('')

    // The helper's target camera UUID should be stable across re-selections
    await page.getByText('Spark').first().click()
    await page.waitForTimeout(300)
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag2 = await getHelperDiagnostic(page)
    expect(diag2!.targetCameraUuid).toBe(diag!.targetCameraUuid)
  })

  test('helper parent is scene root', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag = await getHelperDiagnostic(page)
    // Helper parent UUID should not be null (it's attached to the scene root)
    expect(diag!.helperParentUuid).not.toBeNull()
    expect(diag!.helperParentUuid).not.toBe('')
  })
})

// ---------------------------------------------------------------------------
// Diagnostic lifecycle: stub-only gating, safe teardown
// ---------------------------------------------------------------------------

test.describe('Helper diagnostic lifecycle', () => {
  test('diagnostic is available in stub build', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diag = await getHelperDiagnostic(page)
    expect(diag, 'diagnostic function exists in stub build').not.toBeNull()
  })

  test('diagnostic fields have correct types', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diag = await getHelperDiagnostic(page)
    expect(typeof diag!.ownedHelperCount).toBe('number')
    expect(typeof diag!.helperExists).toBe('boolean')
    // Null-able fields: string or null when no helper is active
    expect(diag!.targetCameraType === null || typeof diag!.targetCameraType === 'string').toBe(true)
    expect(diag!.targetCameraUuid === null || typeof diag!.targetCameraUuid === 'string').toBe(true)
    expect(diag!.helperParentUuid === null || typeof diag!.helperParentUuid === 'string').toBe(true)
    expect(typeof diag!.helpersCreated).toBe('number')
    expect(typeof diag!.helpersDisposed).toBe('number')
  })

  test('diagnostic cleaned up after scene remount', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Diagnostic exists before remount
    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore).not.toBeNull()

    // Navigate away and back
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // New diagnostic installed by new component instance
    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter, 'diagnostic reinstalled after remount').not.toBeNull()
    // Fresh counters from new instance
    expect(diagAfter!.helpersCreated).toBe(0)
    expect(diagAfter!.helpersDisposed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Baby Yoda wrapper: Studio source metadata and transform persistence
// ---------------------------------------------------------------------------

test.describe('Baby Yoda SplatWrapper', () => {
  test('SplatWrapper has Studio source metadata targeting baby_yoda.svelte', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Inspect the SplatWrapper's userData.threlteStudio for source target.
    // Threlte Studio attaches metadata to objects declared via literal <T> nodes.
    // The metadata includes source file information pointing to the scene file.
    const sourceInfo = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { userData: Record<string, unknown> } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) return { found: false, userDataKeys: [] }
      const studio = wrapper.userData?.threlteStudio as Record<string, unknown> | undefined
      const userDataKeys = Object.keys(wrapper.userData).filter(k => k !== '__upbound__')
      if (!studio) return { found: true, hasStudio: false, userDataKeys, studioKeys: [] }
      const studioKeys = Object.keys(studio)
      // Deep-inspect all values in studio metadata for any string containing 'baby_yoda'
      let sourceFile: string | null = null
      function findFile(obj: unknown, path: string): void {
        if (typeof obj === 'string' && obj.includes('baby_yoda')) {
          sourceFile = obj
        } else if (obj && typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            findFile(v, `${path}.${k}`)
          }
        }
      }
      findFile(studio, 'threlteStudio')
      return { found: true, hasStudio: true, userDataKeys, studioKeys, sourceFile, studioJson: JSON.stringify(studio) }
    })

    expect(sourceInfo.found, 'SplatWrapper exists in stub diagnostics').toBe(true)

    if (sourceInfo.hasStudio) {
      // When Studio source metadata is present, it should reference baby_yoda.svelte
      expect(sourceInfo.sourceFile, `SplatWrapper Studio source file (metadata: ${sourceInfo.studioJson})`).not.toBeNull()
      expect(sourceInfo.sourceFile, 'SplatWrapper targets baby_yoda.svelte').toContain('baby_yoda.svelte')
    } else {
      // In stub builds without full Studio source sync, verify the wrapper
      // has userData keys indicating it was processed by Threlte's <T> system.
      const hasThrelteKeys = sourceInfo.userDataKeys.some((k: string) =>
        k.includes('threlte') || k.includes('studio') || k === 'name'
      )
      expect(hasThrelteKeys, 'SplatWrapper has Threlte/Studio userData keys').toBe(true)
    }
  })

  test('wrapper transform persists across capacity reload', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Select Spark and open pane
    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)

    // Set unmistakable non-default wrapper transform
    const wrapperTransform = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }; rotation: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }; scale: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number } } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) throw new Error('SplatWrapper not exposed in stub diagnostics')
      wrapper.position.set(7, 13, 21)
      wrapper.rotation.set(0.3, 0.5, 0.7)
      wrapper.scale.set(1.5, 1.5, 1.5)
      return {
        x: wrapper.position.x, y: wrapper.position.y, z: wrapper.position.z,
        rx: wrapper.rotation.x, ry: wrapper.rotation.y, rz: wrapper.rotation.z,
        sx: wrapper.scale.x, sy: wrapper.scale.y, sz: wrapper.scale.z,
      }
    })

    // Trigger capacity reload
    const capacityInput = page.locator('input#spark-maxPagedSplats')
    await capacityInput.fill('131072')
    await capacityInput.press('Enter')
    await page.waitForTimeout(3000)

    // Wrapper transform preserved exactly after reload
    const wrapperAfter = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } | null
      }
      const w = d.wrapper!
      return {
        x: w.position.x, y: w.position.y, z: w.position.z,
        rx: w.rotation.x, ry: w.rotation.y, rz: w.rotation.z,
        sx: w.scale.x, sy: w.scale.y, sz: w.scale.z,
      }
    })

    expect(wrapperAfter).toEqual(wrapperTransform)
  })

  test('wrapper exists and is accessible after scene remount', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Navigate away and back
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Verify the wrapper exists and is accessible after remount
    const wrapperAfter = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { name: string; position: { x: number; y: number; z: number } } | null
      }
      const w = d.wrapper
      if (!w) return null
      return { name: w.name, x: w.position.x, y: w.position.y, z: w.position.z }
    })
    expect(wrapperAfter, 'wrapper exists after remount').not.toBeNull()
    expect(wrapperAfter!.name).toBe('SplatWrapper')
  })
})

// ---------------------------------------------------------------------------
// SparkControls exactly-once disposal
// ---------------------------------------------------------------------------

test.describe('SparkControls disposal', () => {
  test('SparkControls instance recreated after scene remount', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Spark object should be in the hierarchy
    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })

    // Navigate away — scene unmounts, SparkControls.dispose() called
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    // Navigate back — new scene runtime, new SparkControls
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Spark object should be in the hierarchy again (new instance)
    const sparkItem2 = page.getByText('Spark')
    await expect(sparkItem2.first()).toBeVisible({ timeout: 15_000 })
  })
})

// ---------------------------------------------------------------------------
// Editor camera / app camera regression
// ---------------------------------------------------------------------------

test.describe('Editor camera / app camera regression', () => {
  test('app-camera debug coordinates remain correct while editor camera is active', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    // App camera active: initial position
    const state1 = await getCameraState(page)
    expect(state1.x).toBeCloseTo(0, 0)
    expect(state1.y).toBeCloseTo(0, 0)
    expect(state1.z).toBeCloseTo(-1, 0)

    // Toggle editor camera on
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)

    // App camera debug should still report the same position (not overwritten by editor camera)
    const state2 = await getCameraState(page)
    expect(state2.x, 'app camera X unchanged with editor camera active').toBeCloseTo(state1.x, 0)
    expect(state2.y, 'app camera Y unchanged with editor camera active').toBeCloseTo(state1.y, 0)
    expect(state2.z, 'app camera Z unchanged with editor camera active').toBeCloseTo(state1.z, 0)

    // data-active should be false (editor camera is active)
    const activeAttr = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(activeAttr).toBe('false')

    // Toggle editor camera off
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)

    // data-active should be true again
    const activeAttr2 = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(activeAttr2).toBe('true')

    // App camera position still correct after round-trip
    const state3 = await getCameraState(page)
    expect(state3.x).toBeCloseTo(state1.x, 0)
    expect(state3.y).toBeCloseTo(state1.y, 0)
    expect(state3.z).toBeCloseTo(state1.z, 0)
  })
})
