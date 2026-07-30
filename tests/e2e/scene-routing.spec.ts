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
      sceneUuid: string | null
      helpersCreated: number
      helpersDisposed: number
    })()
  })
}

/** Helper: get stub scene UUID from SceneRuntime diagnostic */
async function getStubSceneUuid(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    return (window as unknown as Record<string, unknown>).__stub_scene_uuid as string | null
  })
}

/** Helper: get stub app camera UUID from SceneRuntime diagnostic */
async function getStubAppCameraUuid(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    return (window as unknown as Record<string, unknown>).__stub_app_camera_uuid as string | null
  })
}

test.describe('Scene routing', () => {
  test('direct visit to /scene/baby_yoda loads the scene', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const header = page.locator('.viewer-header .url-label')
    await expect(header).toBeVisible()
    await expect(header).toContainText('baby_yoda')
  })

  test('refresh at /scene/baby_yoda loads the scene', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

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
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible({ timeout: 10_000 })
  })

  test('scene remount: navigating away and back does not stack resources', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

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
// All run in edit mode where Studio and the helper extension are active
// ---------------------------------------------------------------------------

test.describe('Camera frustum helper', () => {
  test('selecting opted-in animator creates helper for descendant camera', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const animatorItem = page.getByText('Camera ScrollAnimator')
    await expect(animatorItem).toBeVisible({ timeout: 15_000 })
    await animatorItem.click()
    await page.waitForTimeout(500)

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

    // Assert exact scene-root parent identity
    const sceneUuid = await getStubSceneUuid(page)
    expect(sceneUuid).not.toBeNull()
    expect(diag!.helperParentUuid, 'helper parent is scene root').toBe(sceneUuid)

    // Assert exact app-camera target identity
    const appCameraUuid = await getStubAppCameraUuid(page)
    expect(appCameraUuid).not.toBeNull()
    expect(diag!.targetCameraUuid, 'helper targets app camera').toBe(appCameraUuid)
  })

  test('selecting unrelated object removes helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)
    expect(diagBefore!.ownedHelperCount).toBe(1)

    // Select Spark (unrelated)
    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)

    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper removed for unrelated selection').toBe(false)
    expect(diagAfter!.ownedHelperCount, 'zero owned helpers after deselection').toBe(0)
    expect(diagAfter!.helpersDisposed, 'helper disposed counter incremented').toBe(1)
  })

  test('selecting PerspectiveCamera directly creates no custom helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)

    await page.getByText('SplatWrapper').first().click()
    await page.waitForTimeout(500)

    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper removed when selecting non-animator').toBe(false)

    // Select the PerspectiveCamera directly
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

    const diagFinal = await getHelperDiagnostic(page)
    expect(diagFinal!.helperExists, 'no custom helper for direct camera selection').toBe(false)
    expect(diagFinal!.ownedHelperCount, 'zero owned helpers for direct camera').toBe(0)
  })

  test('repeated selection/deselection does not accumulate helpers', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    for (let i = 0; i < 3; i++) {
      await page.getByText('Camera ScrollAnimator').click()
      await page.waitForTimeout(300)
      const diagOn = await getHelperDiagnostic(page)
      expect(diagOn!.helperExists, `iteration ${i}: helper created`).toBe(true)
      expect(diagOn!.ownedHelperCount, `iteration ${i}: exactly one owned`).toBe(1)

      await page.getByText('Spark').first().click()
      await page.waitForTimeout(300)
      const diagOff = await getHelperDiagnostic(page)
      expect(diagOff!.helperExists, `iteration ${i}: helper removed`).toBe(false)
      expect(diagOff!.ownedHelperCount, `iteration ${i}: zero owned after removal`).toBe(0)
    }

    const diagFinal = await getHelperDiagnostic(page)
    expect(diagFinal!.helpersCreated).toBe(3)
    expect(diagFinal!.helpersDisposed).toBe(3)
  })

  test('scene remount cleans up helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper cleaned up after remount').toBe(false)
    expect(diagAfter!.ownedHelperCount, 'zero owned helpers after remount').toBe(0)
    expect(diagAfter!.helpersCreated).toBe(0)
    expect(diagAfter!.helpersDisposed).toBe(0)
  })

  test('helper targets exact app-camera identity', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag = await getHelperDiagnostic(page)
    const appCameraUuid = await getStubAppCameraUuid(page)
    expect(appCameraUuid).not.toBeNull()
    expect(diag!.targetCameraUuid, 'helper targets exact app camera').toBe(appCameraUuid)

    // Stable across re-selections
    await page.getByText('Spark').first().click()
    await page.waitForTimeout(300)
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag2 = await getHelperDiagnostic(page)
    expect(diag2!.targetCameraUuid).toBe(diag!.targetCameraUuid)
  })

  test('helper parent is exact scene root', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag = await getHelperDiagnostic(page)
    const sceneUuid = await getStubSceneUuid(page)
    expect(sceneUuid).not.toBeNull()
    expect(diag!.helperParentUuid, 'helper parent is exact scene root').toBe(sceneUuid)
    expect(diag!.sceneUuid, 'diagnostic sceneUuid matches').toBe(sceneUuid)
  })
})

// ---------------------------------------------------------------------------
// Diagnostic lifecycle: stub-only gating, safe teardown
// Runs in edit mode where the CameraFrustumHelper (and its diagnostic) mounts
// ---------------------------------------------------------------------------

test.describe('Helper diagnostic lifecycle', () => {
  test('diagnostic is available in stub build (edit mode)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diag = await getHelperDiagnostic(page)
    expect(diag, 'diagnostic function exists in stub build').not.toBeNull()
  })

  test('diagnostic fields have correct types (edit mode)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diag = await getHelperDiagnostic(page)
    expect(typeof diag!.ownedHelperCount).toBe('number')
    expect(typeof diag!.helperExists).toBe('boolean')
    expect(diag!.targetCameraType === null || typeof diag!.targetCameraType === 'string').toBe(true)
    expect(diag!.targetCameraUuid === null || typeof diag!.targetCameraUuid === 'string').toBe(true)
    expect(diag!.helperParentUuid === null || typeof diag!.helperParentUuid === 'string').toBe(true)
    expect(diag!.sceneUuid === null || typeof diag!.sceneUuid === 'string').toBe(true)
    expect(typeof diag!.helpersCreated).toBe('number')
    expect(typeof diag!.helpersDisposed).toBe('number')
  })

  test('diagnostic cleaned up after scene remount (edit mode)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore).not.toBeNull()

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter, 'diagnostic reinstalled after remount').not.toBeNull()
    expect(diagAfter!.helpersCreated).toBe(0)
    expect(diagAfter!.helpersDisposed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Baby Yoda wrapper: Studio source metadata and transform persistence
// Studio source metadata test requires edit mode (Studio must be mounted)
// ---------------------------------------------------------------------------

test.describe('Baby Yoda SplatWrapper', () => {
  test('SplatWrapper has Studio source metadata targeting baby_yoda.svelte (edit mode)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const sourceInfo = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { userData: Record<string, unknown> } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) throw new Error('SplatWrapper not found in stub diagnostics')
      const studio = wrapper.userData?.threlteStudio as Record<string, unknown> | undefined
      if (!studio) throw new Error('userData.threlteStudio not found on SplatWrapper')

      // Deep-inspect all values in studio metadata for the source file path
      let sourceFile: string | null = null
      function findFile(obj: unknown): void {
        if (typeof obj === 'string' && obj.includes('baby_yoda')) {
          sourceFile = obj
        } else if (obj && typeof obj === 'object') {
          for (const v of Object.values(obj as Record<string, unknown>)) {
            findFile(v)
          }
        }
      }
      findFile(studio)
      if (!sourceFile) throw new Error(`No baby_yoda.svelte reference in threlteStudio metadata: ${JSON.stringify(studio)}`)
      return sourceFile
    })

    // Normalize path separators for cross-platform comparison
    const normalized = sourceInfo.replace(/\\/g, '/')
    expect(normalized, 'SplatWrapper targets baby_yoda.svelte').toContain('baby_yoda.svelte')
  })

  test('wrapper transform persists across capacity reload (edit mode)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const sparkItem = page.getByText('Spark')
    await expect(sparkItem).toBeVisible({ timeout: 15_000 })
    await sparkItem.click()
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

    const capacityInput = page.locator('input#spark-maxPagedSplats')
    await capacityInput.fill('131072')
    await capacityInput.press('Enter')
    await page.waitForTimeout(3000)

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

  test('wrapper declarative transform persists across scene remount', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Assert the declarative identity transform from baby_yoda.svelte
    const wrapperBefore = await page.evaluate(() => {
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

    // Navigate away and back
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Assert the same declarative transform values after remount
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

    expect(wrapperAfter).toEqual(wrapperBefore)
  })
})

// ---------------------------------------------------------------------------
// SparkControls exactly-once disposal
// ---------------------------------------------------------------------------

test.describe('SparkControls disposal', () => {
  test('old SparkControls disposed exactly once, new instance distinct', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Capture initial disposal state and the registered controls ID
    const initialData = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        sparkControlsDisposals: Record<string, number>
      }
      const disposals = { ...d.sparkControlsDisposals }
      const ids = Object.keys(disposals)
      return { disposals, ids }
    })

    expect(initialData.ids.length, 'one SparkControls registered').toBe(1)
    const controlsId = initialData.ids[0]
    expect(initialData.disposals[controlsId], 'initial disposal count is 0').toBe(0)

    // Navigate away via SPA (← Home button, aria-label="Go back") to preserve stub module state
    await page.getByRole('button', { name: 'Go back' }).click()
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible({ timeout: 10_000 })

    // The old SparkControls should have been disposed exactly once
    const afterUnmount = await page.evaluate((id) => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        sparkControlsDisposals: Record<string, number>
      }
      return { count: d.sparkControlsDisposals[id] ?? -1, all: { ...d.sparkControlsDisposals } }
    }, controlsId)
    expect(afterUnmount.count, `old SparkControls disposed exactly once (all: ${JSON.stringify(afterUnmount.all)})`).toBe(1)

    // Navigate back to scene via SPA (pushState + popstate, not full page load)
    await page.evaluate(() => {
      window.history.pushState({}, '', '/scene/baby_yoda')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // New SparkControls registered with 0 disposals, old one still at 1
    const afterRemount = await page.evaluate((oldId) => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        sparkControlsDisposals: Record<string, number>
      }
      const all = { ...d.sparkControlsDisposals }
      const newIds = Object.keys(all).filter(id => id !== oldId)
      return { oldCount: all[oldId] ?? -1, newIds, all }
    }, controlsId)
    expect(afterRemount.oldCount, 'old SparkControls still disposed once').toBe(1)
    expect(afterRemount.newIds.length, 'new SparkControls instance exists').toBe(1)
    expect(afterRemount.all[afterRemount.newIds[0]], 'new SparkControls not yet disposed').toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Editor camera / app camera regression
// Requires edit mode (Studio editor camera must be present)
// ---------------------------------------------------------------------------

test.describe('Editor camera / app camera regression', () => {
  test('app-camera debug coordinates and active ownership remain correct while editor camera is active (edit mode)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
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

    // App camera debug still reports the same position — app camera look-at
    // is not overwritten by the editor camera (SceneRuntime always uses appCamera)
    const state2 = await getCameraState(page)
    expect(state2.x, 'app camera X unchanged with editor camera active').toBeCloseTo(state1.x, 0)
    expect(state2.y, 'app camera Y unchanged with editor camera active').toBeCloseTo(state1.y, 0)
    expect(state2.z, 'app camera Z unchanged with editor camera active').toBeCloseTo(state1.z, 0)

    // data-active should be false (editor camera is the active Threlte camera)
    const activeAttr = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(activeAttr).toBe('false')

    // Toggle editor camera off
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)

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
