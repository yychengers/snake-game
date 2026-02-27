import { DEFAULT_SETTINGS, type GameSettings } from './config';

const SETTINGS_KEY = 'snake_settings_v1';

/** 从 localStorage 加载设置，失败时回退默认值。 */
export function loadSettings(): GameSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return normalizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 保存设置到 localStorage。 */
export function saveSettings(settings: GameSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

/** 局部更新设置并返回归一化结果。 */
export function patchSettings(current: GameSettings, patch: Partial<GameSettings>): GameSettings {
  return normalizeSettings({ ...current, ...patch });
}

function normalizeSettings(input: Partial<GameSettings>): GameSettings {
  const gridSize = Number(input.gridSize ?? DEFAULT_SETTINGS.gridSize);
  const speedScale = Number(input.speedScale ?? DEFAULT_SETTINGS.speedScale);

  return {
    audioEnabled: Boolean(input.audioEnabled ?? DEFAULT_SETTINGS.audioEnabled),
    gridSize: Math.max(12, Math.min(36, Math.floor(gridSize))),
    speedScale: Math.max(0.7, Math.min(1.4, speedScale)),
    keymap: input.keymap === 'arrows' || input.keymap === 'wasd' || input.keymap === 'both'
      ? input.keymap
      : DEFAULT_SETTINGS.keymap,
  };
}
