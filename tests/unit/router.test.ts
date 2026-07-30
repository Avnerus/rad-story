import { describe, it, expect } from 'vitest'
import { validateSceneName } from '$lib/scenes/registry'
import { parseRoute } from '$lib/router'

describe('validateSceneName', () => {
  it('accepts valid lowercase alphanumeric names', () => {
    expect(validateSceneName('baby_yoda')).toBe('baby_yoda')
    expect(validateSceneName('scene1')).toBe('scene1')
    expect(validateSceneName('a')).toBe('a')
    expect(validateSceneName('my_scene_2')).toBe('my_scene_2')
  })

  it('rejects empty strings', () => {
    expect(validateSceneName('')).toBeNull()
  })

  it('rejects names with path traversal', () => {
    expect(validateSceneName('../evil')).toBeNull()
    expect(validateSceneName('..')).toBeNull()
    expect(validateSceneName('a/b')).toBeNull()
  })

  it('rejects names with uppercase letters', () => {
    expect(validateSceneName('BabyYoda')).toBeNull()
    expect(validateSceneName('SCENE')).toBeNull()
  })

  it('rejects names with special characters', () => {
    expect(validateSceneName('my-scene')).toBeNull()
    expect(validateSceneName('my scene')).toBeNull()
    expect(validateSceneName('my.scene')).toBeNull()
  })
})

describe('parseRoute', () => {
  it('returns landing for root path', () => {
    expect(parseRoute('/')).toEqual({ kind: 'landing' })
    expect(parseRoute('')).toEqual({ kind: 'landing' })
  })

  it('returns landing for unknown paths', () => {
    expect(parseRoute('/viewer')).toEqual({ kind: 'landing' })
    expect(parseRoute('/?url=foo')).toEqual({ kind: 'landing' })
    expect(parseRoute('/random/path')).toEqual({ kind: 'landing' })
  })

  it('returns landing for /scene with no trailing slash', () => {
    expect(parseRoute('/scene')).toEqual({ kind: 'landing' })
  })

  it('returns scene/view match for /scene/{name}', () => {
    const match = parseRoute('/scene/baby_yoda')
    expect(match.kind).toBe('scene')
    if (match.kind === 'scene') {
      expect(match.mode).toBe('view')
      expect(match.scene.name).toBe('baby_yoda')
      expect(match.scene.component).toBeDefined()
    }
  })

  it('returns scene/edit match for /scene/{name}/edit', () => {
    const match = parseRoute('/scene/baby_yoda/edit')
    expect(match.kind).toBe('scene')
    if (match.kind === 'scene') {
      expect(match.mode).toBe('edit')
      expect(match.scene.name).toBe('baby_yoda')
      expect(match.scene.component).toBeDefined()
    }
  })

  it('view and edit matches share the same component identity', () => {
    const viewMatch = parseRoute('/scene/baby_yoda')
    const editMatch = parseRoute('/scene/baby_yoda/edit')
    if (viewMatch.kind === 'scene' && editMatch.kind === 'scene') {
      expect(viewMatch.scene.component).toBe(editMatch.scene.component)
      expect(viewMatch.scene.name).toBe(editMatch.scene.name)
    }
  })

  it('returns not-found for unknown scene name (view)', () => {
    const match = parseRoute('/scene/nonexistent')
    expect(match.kind).toBe('not-found')
    if (match.kind === 'not-found') {
      expect(match.attemptedName).toBe('nonexistent')
    }
  })

  it('returns not-found for unknown scene name (edit)', () => {
    const match = parseRoute('/scene/nonexistent/edit')
    expect(match.kind).toBe('not-found')
    if (match.kind === 'not-found') {
      expect(match.attemptedName).toBe('nonexistent')
    }
  })

  it('returns not-found for empty scene name (/scene/)', () => {
    const match = parseRoute('/scene/')
    expect(match.kind).toBe('not-found')
    if (match.kind === 'not-found') {
      expect(match.attemptedName).toBe('')
    }
  })

  it('returns not-found for uppercase scene names (view)', () => {
    const match = parseRoute('/scene/Baby_Yoda')
    expect(match.kind).toBe('not-found')
  })

  it('returns not-found for uppercase scene names (edit)', () => {
    const match = parseRoute('/scene/Baby_Yoda/edit')
    expect(match.kind).toBe('not-found')
  })

  it('returns not-found for names with special characters (view)', () => {
    const match = parseRoute('/scene/my-scene')
    expect(match.kind).toBe('not-found')
  })

  it('returns not-found for names with special characters (edit)', () => {
    const match = parseRoute('/scene/my-scene/edit')
    expect(match.kind).toBe('not-found')
  })

  it('returns not-found for path traversal attempts (view)', () => {
    const match = parseRoute('/scene/../router')
    expect(match.kind).toBe('not-found')
  })

  it('returns not-found for path traversal attempts (edit)', () => {
    const match = parseRoute('/scene/../router/edit')
    expect(match.kind).toBe('not-found')
  })

  it('returns not-found for unknown suffix /scene/{name}/unknown', () => {
    const match = parseRoute('/scene/baby_yoda/unknown')
    expect(match.kind).toBe('not-found')
    if (match.kind === 'not-found') {
      expect(match.attemptedName).toBe('baby_yoda/unknown')
    }
  })

  it('returns not-found for extra trailing segments', () => {
    const match = parseRoute('/scene/baby_yoda/edit/extra')
    expect(match.kind).toBe('not-found')
    if (match.kind === 'not-found') {
      expect(match.attemptedName).toBe('baby_yoda/edit/extra')
    }
  })

  it('returns not-found for /scene//edit (empty name with edit suffix)', () => {
    const match = parseRoute('/scene//edit')
    expect(match.kind).toBe('not-found')
  })
})
