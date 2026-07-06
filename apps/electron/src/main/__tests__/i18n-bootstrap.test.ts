/**
 * Integration test for the main-process i18n bootstrap.
 *
 * Validates the building blocks of the company default:
 * - `setupI18n()` starts in the package default language.
 * - The main-process bootstrap forces and persists that default language.
 *
 * Together these mean existing and new users start in Simplified Chinese.
 *
 * `CONFIG_DIR` is captured at module-load, so each scenario runs in a
 * subprocess with `CRAFT_CONFIG_DIR` set in its env (same pattern as
 * `packages/shared/src/config/__tests__/storage-startup-migration.test.ts`).
 */
import { describe, it, expect } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

function runScript(configDir: string, script: string): RunResult {
  const result = Bun.spawnSync([process.execPath, '--eval', script], {
    env: { ...process.env, CRAFT_CONFIG_DIR: configDir },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

describe('main-process i18n bootstrap', () => {
  it('forces and persists the default UI language when none exists', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'i18n-bootstrap-'))
    try {
      const r = runScript(
        configDir,
        `
          import { DEFAULT_UI_LANGUAGE, setupI18n, i18n } from '@craft-agent/shared/i18n';
          import { setPersistedUiLanguage, getPersistedUiLanguage } from '@craft-agent/shared/config';
          setupI18n();
          await i18n.changeLanguage(DEFAULT_UI_LANGUAGE);
          setPersistedUiLanguage(DEFAULT_UI_LANGUAGE);
          const persisted = getPersistedUiLanguage();
          console.log(JSON.stringify({ persisted, resolved: i18n.resolvedLanguage }));
        `,
      )
      expect(r.exitCode).toBe(0)
      expect(JSON.parse(r.stdout)).toEqual({ persisted: 'zh-Hans', resolved: 'zh-Hans' })
      expect(existsSync(join(configDir, 'preferences.json'))).toBe(true)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('overrides an existing persisted English language', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'i18n-bootstrap-'))
    try {
      writeFileSync(
        join(configDir, 'preferences.json'),
        JSON.stringify({ uiLanguage: 'en' }),
        'utf-8',
      )
      const r = runScript(
        configDir,
        `
          import { DEFAULT_UI_LANGUAGE, setupI18n, i18n } from '@craft-agent/shared/i18n';
          import { setPersistedUiLanguage, getPersistedUiLanguage } from '@craft-agent/shared/config';
          setupI18n();
          await i18n.changeLanguage(DEFAULT_UI_LANGUAGE);
          setPersistedUiLanguage(DEFAULT_UI_LANGUAGE);
          const persisted = getPersistedUiLanguage();
          console.log(JSON.stringify({ persisted, resolved: i18n.resolvedLanguage }));
        `,
      )
      expect(r.exitCode).toBe(0)
      expect(JSON.parse(r.stdout)).toEqual({ persisted: 'zh-Hans', resolved: 'zh-Hans' })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('ignores invalid persisted codes (defensive read)', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'i18n-bootstrap-'))
    try {
      writeFileSync(
        join(configDir, 'preferences.json'),
        JSON.stringify({ uiLanguage: 'xx' }),
        'utf-8',
      )
      const r = runScript(
        configDir,
        `
          import { getPersistedUiLanguage } from '@craft-agent/shared/config';
          console.log(JSON.stringify({ value: getPersistedUiLanguage() ?? null }));
        `,
      )
      expect(r.exitCode).toBe(0)
      expect(JSON.parse(r.stdout)).toEqual({ value: null })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
