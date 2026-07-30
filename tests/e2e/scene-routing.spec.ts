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

/** Helper: get camera frustum helper diagnostic from stub build */
async function getHelperDiagnostic(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const fn = (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic
    if (typeof fn !== 'function') return null
    return (fn as () => { helperExists: boolean; targetCameraType: string | null })()
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

test.describe('Camera frustum helper', () => {
  test('selecting opted-in animator creates helper for descendant camera', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Wait for Studio hierarchy to load
    const animatorItem = page.getByText('Camera ScrollAnimator')
    await expect(animatorItem).toBeVisible({ timeout: 15_000 })
    await animatorItem.click()
    await page.waitForTimeout(500)

    // Assert helper was created and targets the correct camera
    const diag = await getHelperDiagnostic(page)
    expect(diag, 'helper diagnostic available').not.toBeNull()
    expect(diag!.helperExists, 'helper created for opted-in animator').toBe(true)
    expect(diag!.targetCameraType, 'helper targets PerspectiveCamera').toBe('PerspectiveCamera')
  })

  test('selecting unrelated object removes helper', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // First select the animator to create the helper
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diagBefore = await getHelperDiagnostic(page)
    expect(diagBefore!.helperExists).toBe(true)

    // Now select Spark (unrelated)
    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)

    // Helper should be removed
    const diagAfter = await getHelperDiagnostic(page)
    expect(diagAfter!.helperExists, 'helper removed for unrelated selection').toBe(false)
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

      // Select unrelated → helper removed
      await page.getByText('Spark').first().click()
      await page.waitForTimeout(300)
      const diagOff = await getHelperDiagnostic(page)
      expect(diagOff!.helperExists, `iteration ${i}: helper removed`).toBe(false)
    }
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
  })
})
