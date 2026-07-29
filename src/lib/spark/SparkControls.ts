/**
 * SparkControls — a Three.js Object3D subclass that holds all editable
 * Spark 2.1 rendering-quality, LOD, foveation, and paging-budget settings.
 *
 * Appears in the Studio outline as a selectable object named "Spark".
 * Each setting is exposed as a top-level property so the Studio Inspector
 * shows individually editable numeric/boolean controls. Transform attributes
 * (position, rotation, scale) are blocked by the transaction guard.
 *
 * All numeric values are validated against field-specific bounds derived from
 * the installed Spark 2.1 semantics. NaN, Infinity, and out-of-range values
 * are clamped or rejected.
 */
import { Object3D } from 'three'

// Spark page size constant
export const SPARK_PAGE_SIZE = 65_536

// ---------------------------------------------------------------------------
// Settings type
// ---------------------------------------------------------------------------

/**
 * All editable Spark renderer settings exposed through the SparkControls.
 * Every field is validated and clamped before being stored.
 */
export interface SparkSettings {
  // — LOD / quality —
  lodSplatScale: number
  lodRenderScale: number
  maxStdDev: number
  maxPagedSplats: number

  // — Foveation (full-width angles in degrees) —
  coneFov0: number
  coneFov: number
  coneFoveate: number
  behindFoveate: number

  // — Additional quality / LOD controls —
  minPixelRadius: number
  maxPixelRadius: number
  minAlpha: number
  preBlurAmount: number
  blurAmount: number
  falloff: number
  clipXY: number
  focalAdjustment: number
  sortRadial: boolean
  minSortIntervalMs: number
  enableLod: boolean
  enableLodFetching: boolean
  lodSplatCount: number | null // null = automatic / platform default
  lodInflate: boolean
}

/** Keys of the settings interface (in declaration order). */
export const SETTINGS_KEYS: (keyof SparkSettings)[] = [
  'lodSplatScale',
  'lodRenderScale',
  'maxStdDev',
  'maxPagedSplats',
  'coneFov0',
  'coneFov',
  'coneFoveate',
  'behindFoveate',
  'minPixelRadius',
  'maxPixelRadius',
  'minAlpha',
  'preBlurAmount',
  'blurAmount',
  'falloff',
  'clipXY',
  'focalAdjustment',
  'sortRadial',
  'minSortIntervalMs',
  'enableLod',
  'enableLodFetching',
  'lodSplatCount',
  'lodInflate',
]

// ---------------------------------------------------------------------------
// Field definitions with validation
// ---------------------------------------------------------------------------

interface FieldDef {
  min?: number
  max?: number
  integer?: boolean
  multipleOf?: number
  allowNull?: boolean
  default: number | boolean | null
}

const FIELD_DEFS: Record<keyof SparkSettings, FieldDef> = {
  lodSplatScale:       { min: 0.01, max: 10,   default: 1 },
  lodRenderScale:      { min: 0.1,  max: 10,   default: 1 },
  maxStdDev:           { min: 1,    max: 100,  default: 8 },
  maxPagedSplats:      { min: SPARK_PAGE_SIZE, max: 256 * SPARK_PAGE_SIZE, multipleOf: SPARK_PAGE_SIZE, default: 16 * SPARK_PAGE_SIZE },
  coneFov0:            { min: 0,    max: 180,  default: 90 },
  coneFov:             { min: 0,    max: 180,  default: 120 },
  coneFoveate:         { min: 0,    max: 1,    default: 0.4 },
  behindFoveate:       { min: 0,    max: 1,    default: 0.2 },
  minPixelRadius:      { min: 0,    max: 256,  default: 0 },
  maxPixelRadius:      { min: 1,    max: 4096, default: 512 },
  minAlpha:            { min: 0,    max: 1,    default: 0.5 * (1 / 255) },
  preBlurAmount:       { min: 0,    max: 5,    default: 0 },
  blurAmount:          { min: 0,    max: 5,    default: 0.3 },
  falloff:             { min: 0,    max: 1,    default: 1 },
  clipXY:              { min: 0.5,  max: 5,    default: 1.4 },
  focalAdjustment:     { min: 0.1,  max: 5,    default: 1 },
  sortRadial:          { default: true },
  minSortIntervalMs:   { min: 0,    max: 10000, integer: true, default: 0 },
  enableLod:           { default: true },
  enableLodFetching:   { default: true },
  lodSplatCount:       { min: 10_000, max: 50_000_000, integer: true, allowNull: true, default: null },
  lodInflate:          { default: false },
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate and clamp a single numeric field.
 */
function validateNumber(value: unknown, def: FieldDef): number | null {
  if (def.allowNull && value === null) return null
  if (def.allowNull && value === undefined) return def.default as number | null

  let n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) n = def.default as number

  // Clamp to bounds
  if (def.min !== undefined) n = Math.max(def.min, n)
  if (def.max !== undefined) n = Math.min(def.max, n)

  // Integer rounding
  if (def.integer) n = Math.round(n)

  // Multiple-of rounding (round up to nearest multiple)
  if (def.multipleOf) {
    n = Math.ceil(n / def.multipleOf) * def.multipleOf
  }

  return n as number
}

/**
 * Validate a boolean field. Accepts boolean values, the strings "true"/"false",
 * and the numbers 1/0. All other values fall back to the field default.
 */
function validateBoolean(value: unknown, def: FieldDef): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1) return true
  if (value === 'false' || value === 0) return false
  return def.default as boolean
}

// ---------------------------------------------------------------------------
// Core validation (shared by constructor and setters)
// ---------------------------------------------------------------------------

/**
 * Validate a single field value. Returns the validated value.
 */
function validateField<K extends keyof SparkSettings>(
  key: K,
  raw: unknown,
): SparkSettings[K] {
  const def = FIELD_DEFS[key]
  if (typeof def.default === 'boolean') {
    return validateBoolean(raw, def) as SparkSettings[K]
  }
  return validateNumber(raw, def) as SparkSettings[K]
}

/**
 * Apply coupled invariants after validation.
 * Mutates the validated map in place.
 */
function applyInvariants(validated: Partial<SparkSettings>, current: SparkSettings): void {
  // coneFov0 <= coneFov (merge with current for cross-field check)
  const mergedConeFov0 = validated.coneFov0 ?? current.coneFov0
  const mergedConeFov = validated.coneFov ?? current.coneFov
  if (mergedConeFov0 > mergedConeFov) {
    // Always raise coneFov to match coneFov0
    // Only write to validated if the current value differs (i.e., it needs changing)
    if (mergedConeFov !== mergedConeFov0) {
      validated.coneFov = mergedConeFov0
    }
  }

  // minPixelRadius <= maxPixelRadius
  const mergedMinPr = validated.minPixelRadius ?? current.minPixelRadius
  const mergedMaxPr = validated.maxPixelRadius ?? current.maxPixelRadius
  if (mergedMinPr > mergedMaxPr) {
    if (mergedMaxPr !== mergedMinPr) {
      validated.maxPixelRadius = mergedMinPr
    }
  }
}

// ---------------------------------------------------------------------------
// SparkControls class
// ---------------------------------------------------------------------------

export type SettingsChangeHandler = (changed: Set<keyof SparkSettings>) => void

/**
 * Branded Object3D that holds editable Spark settings.
 *
 * Each setting is exposed as a top-level property (getter/setter) so the
 * Studio Inspector shows individually editable controls. The transaction
 * guard whitelists exactly these attribute names and blocks transforms.
 */
export class SparkControls extends Object3D {
  /** HMR-safe brand for runtime detection. */
  declare isSparkControls: boolean
  declare type: string

  private _settings: SparkSettings
  private _listeners: SettingsChangeHandler[] = []

  constructor(initial?: Partial<SparkSettings>) {
    super()
    this.isSparkControls = true
    this.type = 'SparkControls'
    this.name = 'Spark'

    // Start with defaults
    const defaults = this.createDefaultSettings()

    // Validate and merge initial values
    if (initial) {
      const validated: Partial<SparkSettings> = {}
      for (const key of SETTINGS_KEYS) {
        const raw = initial[key]
        if (raw === undefined) continue
        validated[key] = validateField(key, raw)
      }
      applyInvariants(validated, defaults)
      this._settings = { ...defaults, ...validated }
    } else {
      this._settings = defaults
    }
  }

  /**
   * Create a settings object with all field defaults.
   */
  createDefaultSettings(): SparkSettings {
    const s = {} as SparkSettings
    for (const [key, def] of Object.entries(FIELD_DEFS)) {
      ;(s as unknown as Record<string, unknown>)[key] = def.default
    }
    return s
  }

  /**
   * Get the current validated settings (deep copy).
   */
  get settings(): SparkSettings {
    return { ...this._settings }
  }

  /**
   * Set settings from a plain object (used by Threlte <T> source sync).
   * All values are validated. Emits change notifications.
   */
  set settings(value: Partial<SparkSettings>) {
    const previous = { ...this._settings }
    const validated: Partial<SparkSettings> = {}

    for (const key of SETTINGS_KEYS) {
      const raw = value[key]
      if (raw === undefined) continue
      validated[key] = validateField(key, raw)
    }

    // Apply invariants
    applyInvariants(validated, this._settings)

    const merged = { ...this._settings, ...validated }
    this._settings = merged

    // Determine which fields actually changed
    const changed = new Set<keyof SparkSettings>()
    for (const k of SETTINGS_KEYS) {
      if (previous[k] !== merged[k]) changed.add(k)
    }

    if (changed.size > 0) {
      for (const fn of this._listeners) fn(changed)
    }
  }

  // -----------------------------------------------------------------------
  // Top-level property accessors for each setting
  // Each one goes through validation and emits change notifications.
  // -----------------------------------------------------------------------

  get lodSplatScale(): number { return this._settings.lodSplatScale }
  set lodSplatScale(v: unknown) { this.setOne('lodSplatScale', v) }

  get lodRenderScale(): number { return this._settings.lodRenderScale }
  set lodRenderScale(v: unknown) { this.setOne('lodRenderScale', v) }

  get maxStdDev(): number { return this._settings.maxStdDev }
  set maxStdDev(v: unknown) { this.setOne('maxStdDev', v) }

  get maxPagedSplats(): number { return this._settings.maxPagedSplats }
  set maxPagedSplats(v: unknown) { this.setOne('maxPagedSplats', v) }

  get coneFov0(): number { return this._settings.coneFov0 }
  set coneFov0(v: unknown) { this.setOne('coneFov0', v) }

  get coneFov(): number { return this._settings.coneFov }
  set coneFov(v: unknown) { this.setOne('coneFov', v) }

  get coneFoveate(): number { return this._settings.coneFoveate }
  set coneFoveate(v: unknown) { this.setOne('coneFoveate', v) }

  get behindFoveate(): number { return this._settings.behindFoveate }
  set behindFoveate(v: unknown) { this.setOne('behindFoveate', v) }

  get minPixelRadius(): number { return this._settings.minPixelRadius }
  set minPixelRadius(v: unknown) { this.setOne('minPixelRadius', v) }

  get maxPixelRadius(): number { return this._settings.maxPixelRadius }
  set maxPixelRadius(v: unknown) { this.setOne('maxPixelRadius', v) }

  get minAlpha(): number { return this._settings.minAlpha }
  set minAlpha(v: unknown) { this.setOne('minAlpha', v) }

  get preBlurAmount(): number { return this._settings.preBlurAmount }
  set preBlurAmount(v: unknown) { this.setOne('preBlurAmount', v) }

  get blurAmount(): number { return this._settings.blurAmount }
  set blurAmount(v: unknown) { this.setOne('blurAmount', v) }

  get falloff(): number { return this._settings.falloff }
  set falloff(v: unknown) { this.setOne('falloff', v) }

  get clipXY(): number { return this._settings.clipXY }
  set clipXY(v: unknown) { this.setOne('clipXY', v) }

  get focalAdjustment(): number { return this._settings.focalAdjustment }
  set focalAdjustment(v: unknown) { this.setOne('focalAdjustment', v) }

  get sortRadial(): boolean { return this._settings.sortRadial }
  set sortRadial(v: unknown) { this.setOne('sortRadial', v) }

  get minSortIntervalMs(): number { return this._settings.minSortIntervalMs }
  set minSortIntervalMs(v: unknown) { this.setOne('minSortIntervalMs', v) }

  get enableLod(): boolean { return this._settings.enableLod }
  set enableLod(v: unknown) { this.setOne('enableLod', v) }

  get enableLodFetching(): boolean { return this._settings.enableLodFetching }
  set enableLodFetching(v: unknown) { this.setOne('enableLodFetching', v) }

  get lodSplatCount(): number | null { return this._settings.lodSplatCount }
  set lodSplatCount(v: unknown) { this.setOne('lodSplatCount', v) }

  get lodInflate(): boolean { return this._settings.lodInflate }
  set lodInflate(v: unknown) { this.setOne('lodInflate', v) }

  /**
   * Set a single field through validation. Emits change notification.
   */
  private setOne<K extends keyof SparkSettings>(key: K, raw: unknown): void {
    const validated = validateField(key, raw)
    if (validated === this._settings[key]) return

    const previous = { ...this._settings }
    const newSettings = { ...this._settings, [key]: validated }

    // Apply invariants that may affect other fields
    const extraChanges: Partial<SparkSettings> = {}
    applyInvariants(extraChanges, { ...previous, [key]: validated })
    for (const [ik, iv] of Object.entries(extraChanges)) {
      newSettings[ik as keyof SparkSettings] = iv as never
    }

    this._settings = newSettings

    // Determine which fields actually changed
    const changed = new Set<keyof SparkSettings>()
    for (const k of SETTINGS_KEYS) {
      if (previous[k] !== newSettings[k]) changed.add(k)
    }

    if (changed.size > 0) {
      for (const fn of this._listeners) fn(changed)
    }
  }

  /**
   * Subscribe to settings changes. Returns an unsubscribe function.
   */
  onChange(fn: SettingsChangeHandler): () => void {
    this._listeners.push(fn)
    return () => {
      const idx = this._listeners.indexOf(fn)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  /**
   * Dispose: clear all listeners.
   */
  dispose(): void {
    this._listeners.length = 0
  }
}
