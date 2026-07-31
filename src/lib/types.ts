/** Named device profile identifier */
export type DeviceProfileName = 'desktop' | 'mobile'

/** Result type for RAD URL validation */
export type ValidationResult = SuccessResult | ErrorResult

export interface SuccessResult {
  ok: true
  url: string
}

export interface ErrorResult {
  ok: false
  error: string
}

/** Spark renderer performance profile options */
export interface SparkRendererOptions {
  lodSplatScale: number
  lodRenderScale: number
  maxStdDev: number
  maxPagedSplats: number
  coneFov0: number
  coneFov: number
  coneFoveate: number
  behindFoveate: number
  minPixelRadius?: number
  maxPixelRadius?: number
  minAlpha?: number
  preBlurAmount?: number
  blurAmount?: number
  falloff?: number
  clipXY?: number
  focalAdjustment?: number
  sortRadial?: boolean
  minSortIntervalMs?: number
  enableLod?: boolean
  enableLodFetching?: boolean
  lodSplatCount?: number | null
  lodInflate?: boolean
}

/** Device profile for Spark / renderer settings */
export interface DeviceProfile {
  isMobile: boolean
  dpr: number
  sparkRenderer: SparkRendererOptions
}
