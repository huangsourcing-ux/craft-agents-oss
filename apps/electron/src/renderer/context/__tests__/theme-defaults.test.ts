import { describe, expect, it } from 'bun:test'
import {
  FORCED_DEFAULT_COLOR_THEME,
  FORCED_DEFAULT_THEME_MODE,
  normalizeForcedThemePreference,
} from '../theme-defaults'

describe('normalizeForcedThemePreference', () => {
  it('forces light mode and GitHub color theme while preserving font', () => {
    const normalized = normalizeForcedThemePreference({
      mode: 'dark',
      colorTheme: 'dracula',
      font: 'inter',
      isUserOverride: false,
    })

    expect(normalized).toEqual({
      mode: FORCED_DEFAULT_THEME_MODE,
      colorTheme: FORCED_DEFAULT_COLOR_THEME,
      font: 'inter',
      isUserOverride: true,
    })
  })

  it('uses the default font when no stored preference exists', () => {
    expect(normalizeForcedThemePreference(null)).toEqual({
      mode: 'light',
      colorTheme: 'github',
      font: 'system',
      isUserOverride: true,
    })
  })
})
