import type { DeviceProfile } from '$lib/types'

/**
 * Detect if the current device is mobile / iOS.
 * Uses Spark's `isMobile` when available, with a UA fallback.
 */
function detectMobile(): boolean {
  // Fallback: UA-based detection
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
}

/**
 * Return device-appropriate Spark / renderer settings.
 *
 * Mobile devices get conservative settings to avoid GPU overload:
 *  - DPR clamped to 1
 *  - Reduced splat scale / higher render scale
 *  - Lower maxStdDev
 *  - Conservative maxPagedSplats
 *  - Stronger foveation
 */
export function getDeviceProfile(): DeviceProfile {
  const mobile = detectMobile()

  if (mobile) {
    return {
      isMobile: true,
      dpr: 1,
      sparkRenderer: {
        lodSplatScale: 0.5,
        lodRenderScale: 2,
        maxStdDev: 2.8,
        maxPagedSplats: 1_048_576,
        coneFov0: 70,
        coneFov: 110,
        coneFoveate: 0.4,
        behindFoveate: 0.3,
      },
    }
  }

  return {
    isMobile: false,
    dpr: Math.min(window.devicePixelRatio, 2),
    sparkRenderer: {
      lodSplatScale: 1,
      lodRenderScale: 1,
      maxStdDev: 2.8,
      maxPagedSplats: 2_621_440,
      coneFov0: 90,
      coneFov: 120,
      coneFoveate: 0.2,
      behindFoveate: 0.1,
    },
  }
}
