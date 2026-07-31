import { test, expect } from '@playwright/test'

/** Helper: wait for the canvas to appear */
async function waitForCanvas(page: import('@playwright/test').Page) {
  await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
}

/** Helper: check whether the stats.js widget is present */
async function hasStatsWidget(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.querySelector('[data-testid="stats-widget"]') !== null
  })
}

// ---------------------------------------------------------------------------
// Positive: ?debug=true on scene playback
// ---------------------------------------------------------------------------

test.describe('Debug FPS widget — playback mode', () => {
  test('shows stats.js widget at /scene/baby_yoda?debug=true', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    const widget = page.locator('[data-testid="stats-widget"]')
    await expect(widget).toBeVisible({ timeout: 15_000 })

    // stats.js container is a div with inline style and a canvas child
    const tag = await widget.evaluate((el) => el.tagName.toLowerCase())
    expect(tag).toBe('div')

    const canvasChild = await widget.evaluate((el) => el.querySelector('canvas') !== null)
    expect(canvasChild, 'widget contains an FPS canvas').toBe(true)
  })

  test('shows stats.js widget at /scene/baby_yoda/edit?debug=true', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit?debug=true')
    await waitForCanvas(page)

    const widget = page.locator('[data-testid="stats-widget"]')
    await expect(widget).toBeVisible({ timeout: 15_000 })

    const canvasChild = await widget.evaluate((el) => el.querySelector('canvas') !== null)
    expect(canvasChild, 'widget contains an FPS canvas').toBe(true)
  })

  test('widget is fixed at top-left of viewport', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    const rect = await page.locator('[data-testid="stats-widget"]').boundingBox()
    expect(rect, 'widget bounding box found').not.toBeNull()
    expect(rect!.x, 'widget at left edge').toBe(0)
    expect(rect!.y, 'widget at top edge').toBe(0)
  })

  test('widget remains visible after scrolling', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    const widget = page.locator('[data-testid="stats-widget"]')
    await expect(widget).toBeVisible()

    // Scroll to bottom
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight) })
    await page.waitForTimeout(500)

    // Widget should still be at top-left
    const rect = await widget.boundingBox()
    expect(rect, 'widget still visible after scroll').not.toBeNull()
    expect(rect!.x, 'still at left edge').toBe(0)
    expect(rect!.y, 'still at top edge').toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Negative: no widget without ?debug=true
// ---------------------------------------------------------------------------

test.describe('Debug FPS widget — negative cases', () => {
  test('no widget at /scene/baby_yoda (no query)', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await waitForCanvas(page)

    expect(await hasStatsWidget(page)).toBe(false)
  })

  test('no widget at /scene/baby_yoda/edit (no query)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await waitForCanvas(page)

    expect(await hasStatsWidget(page)).toBe(false)
  })

  test('no widget at /scene/baby_yoda?debug=false', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=false')
    await waitForCanvas(page)

    expect(await hasStatsWidget(page)).toBe(false)
  })

  test('no widget at /scene/baby_yoda?debug=', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=')
    await waitForCanvas(page)

    expect(await hasStatsWidget(page)).toBe(false)
  })

  test('no widget at /scene/baby_yoda?debug=yes', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=yes')
    await waitForCanvas(page)

    expect(await hasStatsWidget(page)).toBe(false)
  })

  test('no widget on landing page even with ?debug=true', async ({ page }) => {
    await page.goto('/?debug=true')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    expect(await hasStatsWidget(page)).toBe(false)
  })

  test('no widget on not-found page even with ?debug=true', async ({ page }) => {
    await page.goto('/scene/nonexistent?debug=true')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })

    expect(await hasStatsWidget(page)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Route transition / duplicate cleanup
// ---------------------------------------------------------------------------

test.describe('Debug FPS widget — route transitions', () => {
  test('navigating away from scene removes the widget', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    await expect(page.locator('[data-testid="stats-widget"]')).toBeVisible({ timeout: 15_000 })

    // Navigate to landing
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    expect(await hasStatsWidget(page), 'widget removed after navigating to landing').toBe(false)
  })

  test('navigating from debug scene to non-debug scene removes widget', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    await expect(page.locator('[data-testid="stats-widget"]')).toBeVisible({ timeout: 15_000 })

    // Navigate to same scene without debug flag
    await page.goto('/scene/baby_yoda')
    await waitForCanvas(page)

    expect(await hasStatsWidget(page), 'widget removed after navigating without debug').toBe(false)
  })

  test('repeated scene remounts do not create duplicate widgets', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    await expect(page.locator('[data-testid="stats-widget"]')).toBeVisible({ timeout: 15_000 })

    // Navigate away and back several times
    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
      await page.goto('/scene/baby_yoda?debug=true')
      await waitForCanvas(page)
      await expect(page.locator('[data-testid="stats-widget"]')).toBeVisible({ timeout: 15_000 })
    }

    // Count widgets — should be exactly one
    const count = await page.locator('[data-testid="stats-widget"]').count()
    expect(count, 'exactly one widget after remounts').toBe(1)
  })

  test('widget works after direct page reload at /scene/baby_yoda?debug=true', async ({ page }) => {
    await page.goto('/scene/baby_yoda?debug=true')
    await waitForCanvas(page)

    await expect(page.locator('[data-testid="stats-widget"]')).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await waitForCanvas(page)

    await expect(page.locator('[data-testid="stats-widget"]')).toBeVisible({ timeout: 15_000 })
    const count = await page.locator('[data-testid="stats-widget"]').count()
    expect(count, 'exactly one widget after reload').toBe(1)
  })
})
