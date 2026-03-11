import type { TetrisGameMode } from './types';

export type TetrisSettings = {
  theme: string;
  keymap: 'arrows' | 'wasd' | 'both';
  audioEnabled: boolean;
};

const DEFAULT_TETRIS_SETTINGS: TetrisSettings = {
  theme: 'cyberpunk',
  keymap: 'arrows',
  audioEnabled: true,
};

const SETTINGS_KEY = 'tetris_settings_v1';

export function loadTetrisSettings(): TetrisSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_TETRIS_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_TETRIS_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<TetrisSettings>;
    return normalizeTetrisSettings(parsed);
  } catch {
    return DEFAULT_TETRIS_SETTINGS;
  }
}

export function saveTetrisSettings(settings: TetrisSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeTetrisSettings(settings)));
}

export function patchTetrisSettings(
  current: TetrisSettings,
  patch: Partial<TetrisSettings>
): TetrisSettings {
  return normalizeTetrisSettings({ ...current, ...patch });
}

function normalizeTetrisSettings(input: Partial<TetrisSettings>): TetrisSettings {
  return {
    audioEnabled: Boolean(input.audioEnabled ?? DEFAULT_TETRIS_SETTINGS.audioEnabled),
    keymap:
      input.keymap === 'arrows' || input.keymap === 'wasd' || input.keymap === 'both'
        ? input.keymap
        : DEFAULT_TETRIS_SETTINGS.keymap,
    theme: input.theme ?? DEFAULT_TETRIS_SETTINGS.theme,
  };
}

export { DEFAULT_TETRIS_SETTINGS };
