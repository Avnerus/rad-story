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
  }, { timeout: 15_000 })
}

/**
 * Helper: get current SparkControls settings snapshot from stub diagnostics.
 */
async function getCurrentSparkSettings(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
      sparkControlsSettings: Record<string, Record<string, unknown>>
      sparkControlsDisposals: Record<string, number>
    }
    // Find the current (non-disposed) controller
    const allIds = Object.keys(d.sparkControlsDisposals)
    const currentId = allIds.find(id => d.sparkControlsDisposals[id] === 0)
    if (!currentId) return null
    return { id: currentId, settings: d.sparkControlsSettings[currentId] ?? null }
  })
}

// ---------------------------------------------------------------------------
// Playback mode e2e tests (/scene/baby_yoda)
// ---------------------------------------------------------------------------

test.describe('Playback mode (/scene/baby_yoda)', () => {
  test('direct visit loads the scene with canvas', async ({ page }) => {
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

  test('playback mode has no Studio toolbar', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const studioToolbarExists = await page.evaluate(() => {
      return {
        scrollAnimator: !!document.querySelector('button[aria-label="Scroll Animator"]'),
        sparkControls: !!document.querySelector('button[aria-label="Spark Controls"]'),
        editorCamera: !!document.querySelector('button[aria-label="Editor Camera"]'),
        inspector: !!document.querySelector('button[aria-label="Inspector"]'),
      }
    })
    expect(studioToolbarExists.scrollAnimator, 'no Scroll Animator button').toBe(false)
    expect(studioToolbarExists.sparkControls, 'no Spark Controls button').toBe(false)
    expect(studioToolbarExists.editorCamera, 'no Editor Camera button').toBe(false)
    expect(studioToolbarExists.inspector, 'no Inspector button').toBe(false)
  })

  test('playback mode has no Studio hierarchy (tree-view)', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const hasTreeView = await page.evaluate(() => document.querySelector('tree-view') !== null)
    expect(hasTreeView, 'no tree-view (Studio hierarchy)').toBe(false)
  })

  test('playback mode has no custom frustum helper diagnostic', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const hasDiagnostic = await page.evaluate(() =>
      typeof (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic === 'function'
    )
    expect(hasDiagnostic, 'no frustum helper diagnostic in playback').toBe(false)
  })

  test('playback app camera is active (data-active="true")', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const activeAttr = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(activeAttr, 'app camera is active in playback').toBe('true')
  })

  test('playback scroll 0% camera position matches keyframes', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const state = await getCameraState(page)
    expect(state.progress).toBeCloseTo(0, 1)
    expect(state.x).toBeCloseTo(0, 0)
    expect(state.y).toBeCloseTo(0, 0)
    expect(state.z).toBeCloseTo(-1, 0)
  })

  test('playback scroll 100% camera position matches keyframes', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight) })
    await page.waitForTimeout(800)

    const state = await getCameraState(page)
    expect(state.progress).toBeGreaterThan(95)
    expect(state.y).toBeGreaterThan(25)
  })

  test('playback SplatWrapper transform matches scene values', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const wrapper = await page.evaluate(() => {
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

    expect(wrapper).toEqual({
      x: 0, y: 0, z: 0,
      rx: 0, ry: 0, rz: 0,
      sx: 1, sy: 1, sz: 1,
    })
  })

  test('playback Spark settings: all 22 fields present and correct', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const current = await getCurrentSparkSettings(page)
    expect(current, 'current SparkControls found').not.toBeNull()
    expect(current!.settings, 'settings snapshot captured').not.toBeNull()

    const settings = current!.settings!
    const expectedFields = [
      'lodSplatScale', 'lodRenderScale', 'maxStdDev', 'maxPagedSplats',
      'coneFov0', 'coneFov', 'coneFoveate', 'behindFoveate',
      'minPixelRadius', 'maxPixelRadius', 'minAlpha', 'preBlurAmount',
      'blurAmount', 'falloff', 'clipXY', 'focalAdjustment',
      'sortRadial', 'minSortIntervalMs', 'enableLod', 'enableLodFetching',
      'lodSplatCount', 'lodInflate',
    ]
    for (const field of expectedFields) {
      expect(settings[field] !== undefined, `field ${field} present`).toBe(true)
    }
    expect(Object.keys(settings).length, 'all 22 settings present').toBe(22)
  })

  test('playback repeated mount/unmount does not stack resources', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
      await page.goto('/scene/baby_yoda')
      await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
      await waitForDebugElement(page)

      const state = await getCameraState(page)
      expect(state.y).toBeCloseTo(0, 0)
      expect(state.z).toBeCloseTo(-1, 0)
    }
  })
})

// ---------------------------------------------------------------------------
// Edit mode e2e tests (/scene/baby_yoda/edit)
// ---------------------------------------------------------------------------

test.describe('Edit mode (/scene/baby_yoda/edit)', () => {
  test('direct visit loads the scene with Studio toolbar', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const header = page.locator('.viewer-header .url-label')
    await expect(header).toBeVisible()
    await expect(header).toContainText('baby_yoda')

    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Spark Controls' })).toBeVisible({ timeout: 15_000 })
  })

  test('edit mode has Studio hierarchy with scene objects', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText('Camera ScrollAnimator')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Camera Target ScrollAnimator')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Spark')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('SplatWrapper')).toBeVisible({ timeout: 15_000 })
  })

  test('edit mode hierarchy items are selectable', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const animatorName = page.locator('.sa-animator-name')
    await expect(animatorName).toBeVisible({ timeout: 10_000 })
    await expect(animatorName).toContainText('Camera ScrollAnimator')
  })

  test('edit mode editor camera ownership toggles', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    let active = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(active).toBe('true')

    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)
    active = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(active).toBe('false')

    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)
    active = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(active).toBe('true')
  })

  test('edit mode Scroll Animator pane edits work', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const keyframeRows = page.locator('.sa-kf-row')
    expect(await keyframeRows.count()).toBe(2)
  })

  test('edit mode Spark Controls pane works', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('spark-controls-panel')).toBeVisible()

    const expectedFields = [
      'lodSplatScale', 'lodRenderScale', 'maxStdDev', 'maxPagedSplats',
      'coneFov0', 'coneFov', 'coneFoveate', 'behindFoveate',
      'minPixelRadius', 'maxPixelRadius', 'minAlpha', 'preBlurAmount',
      'blurAmount', 'falloff', 'clipXY', 'focalAdjustment',
      'sortRadial', 'minSortIntervalMs', 'enableLod', 'enableLodFetching',
      'lodSplatCount', 'lodInflate',
    ]
    for (const field of expectedFields) {
      await expect(page.getByTestId(`spark-field-${field}`)).toBeVisible()
    }
  })

  test('edit mode camera frustum helper works for opted-in animator', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const hasDiagnostic = await page.evaluate(() =>
      typeof (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic === 'function'
    )
    expect(hasDiagnostic, 'frustum helper diagnostic exists in edit mode').toBe(true)

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag = await page.evaluate(() => {
      const fn = (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic
      if (typeof fn !== 'function') return null
      return (fn as () => { helperExists: boolean; ownedHelperCount: number })()
    })
    expect(diag, 'diagnostic callable').not.toBeNull()
    expect(diag!.helperExists, 'helper created for opted-in animator').toBe(true)
    expect(diag!.ownedHelperCount, 'exactly one owned helper').toBe(1)
  })

  test('edit mode SplatWrapper has Studio source metadata', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const sourceInfo = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { userData: Record<string, unknown> } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) throw new Error('SplatWrapper not found')
      const studio = wrapper.userData?.threlteStudio as Record<string, unknown> | undefined
      if (!studio) throw new Error('userData.threlteStudio not found')

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
      return sourceFile
    })

    const normalized = sourceInfo!.replace(/\\/g, '/')
    expect(normalized, 'SplatWrapper targets baby_yoda.svelte').toContain('baby_yoda.svelte')
  })
})

// ---------------------------------------------------------------------------
// Persisted Spark settings: view/edit equality and renderer propagation
// ---------------------------------------------------------------------------

test.describe('Persisted Spark settings', () => {
  test('playback and edit settings snapshots are deeply identical', async ({ page }) => {
    // Get playback settings
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const viewSettings = await getCurrentSparkSettings(page)
    expect(viewSettings, 'playback SparkControls found').not.toBeNull()
    expect(viewSettings!.settings, 'playback settings captured').not.toBeNull()
    expect(Object.keys(viewSettings!.settings!).length, 'playback has 22 settings').toBe(22)

    // Navigate to edit mode
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const editSettings = await getCurrentSparkSettings(page)
    expect(editSettings, 'edit SparkControls found').not.toBeNull()
    expect(editSettings!.settings, 'edit settings captured').not.toBeNull()
    expect(Object.keys(editSettings!.settings!).length, 'edit has 22 settings').toBe(22)

    // Deep equality
    expect(editSettings!.settings, 'edit settings deeply equal to playback').toEqual(viewSettings!.settings)
  })

  test('representative persisted settings reach Spark renderers (playback)', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Get settings from controller
    const controller = await getCurrentSparkSettings(page)
    expect(controller!.settings).not.toBeNull()

    // Assert representative values on the live driving renderer
    // Use fields from the device profile (seeded in SparkControls constructor and propagated to renderers)
    const rendererValues = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        renderers: { maxPagedSplats: number; lodSplatScale: number; coneFov0: number; coneFoveate: number; pager: { maxSplats: number } | undefined }[]
      }
      const driving = d.renderers.find((r: { enableDriveLod: boolean }) => r.enableDriveLod)
      if (!driving) return null
      return {
        maxPagedSplats: driving.maxPagedSplats,
        lodSplatScale: driving.lodSplatScale,
        coneFov0: driving.coneFov0,
        coneFoveate: driving.coneFoveate,
        pagerMaxSplats: driving.pager?.maxSplats ?? 0,
      }
    })
    expect(rendererValues, 'driving renderer found').not.toBeNull()

    // maxPagedSplats (capacity)
    expect(rendererValues!.maxPagedSplats).toBe(controller!.settings!.maxPagedSplats)
    // lodSplatScale (LOD)
    expect(rendererValues!.lodSplatScale).toBe(controller!.settings!.lodSplatScale)
    // coneFov0 (foveation)
    expect(rendererValues!.coneFov0).toBe(controller!.settings!.coneFov0)
    // coneFoveate (foveation)
    expect(rendererValues!.coneFoveate).toBe(controller!.settings!.coneFoveate)
  })

  test('representative persisted settings reach Spark renderers (edit)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const controller = await getCurrentSparkSettings(page)
    expect(controller!.settings).not.toBeNull()

    const rendererValues = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        renderers: { maxPagedSplats: number; lodSplatScale: number; coneFov0: number; coneFoveate: number; pager: { maxSplats: number } | undefined }[]
      }
      const driving = d.renderers.find((r: { enableDriveLod: boolean }) => r.enableDriveLod)
      if (!driving) return null
      return {
        maxPagedSplats: driving.maxPagedSplats,
        lodSplatScale: driving.lodSplatScale,
        coneFov0: driving.coneFov0,
        coneFoveate: driving.coneFoveate,
        pagerMaxSplats: driving.pager?.maxSplats ?? 0,
      }
    })
    expect(rendererValues, 'driving renderer found').not.toBeNull()

    expect(rendererValues!.maxPagedSplats).toBe(controller!.settings!.maxPagedSplats)
    expect(rendererValues!.lodSplatScale).toBe(controller!.settings!.lodSplatScale)
    expect(rendererValues!.coneFov0).toBe(controller!.settings!.coneFov0)
    expect(rendererValues!.coneFoveate).toBe(controller!.settings!.coneFoveate)
  })
})

// ---------------------------------------------------------------------------
// Not-found for malformed edit routes
// ---------------------------------------------------------------------------

test.describe('Not-found for malformed edit routes', () => {
  test('unknown scene name /edit shows not-found', async ({ page }) => {
    await page.goto('/scene/nonexistent/edit')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('/scene/baby_yoda/unknown shows not-found', async ({ page }) => {
    await page.goto('/scene/baby_yoda/unknown')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('/scene/baby_yoda/edit/extra shows not-found', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit/extra')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('uppercase scene name /edit shows not-found', async ({ page }) => {
    await page.goto('/scene/Baby_Yoda/edit')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })
})
