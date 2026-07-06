export type ForcedThemeMode = 'light'
export type ForcedColorTheme = 'github'
export type FontFamilyPreference = 'inter' | 'system'

export interface StoredThemePreference {
  mode?: string
  colorTheme?: string
  font?: FontFamilyPreference
  isUserOverride?: boolean
}

export interface ForcedThemePreference {
  mode: ForcedThemeMode
  colorTheme: ForcedColorTheme
  font: FontFamilyPreference
  isUserOverride: true
}

export const FORCED_DEFAULT_THEME_MODE: ForcedThemeMode = 'light'
export const FORCED_DEFAULT_COLOR_THEME: ForcedColorTheme = 'github'
export const DEFAULT_FONT_FAMILY: FontFamilyPreference = 'system'

export function normalizeForcedThemePreference(
  stored: StoredThemePreference | null | undefined,
  defaultFont: FontFamilyPreference = DEFAULT_FONT_FAMILY,
): ForcedThemePreference {
  return {
    mode: FORCED_DEFAULT_THEME_MODE,
    colorTheme: FORCED_DEFAULT_COLOR_THEME,
    font: stored?.font ?? defaultFont,
    isUserOverride: true,
  }
}
