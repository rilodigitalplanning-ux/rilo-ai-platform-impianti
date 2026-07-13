export interface ModuleTheme {
  primary: string;
  dark: string;
  accent: string;
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  'panel-schedule': {
    primary: '#0d2b3a',
    dark: '#081b24',
    accent: '#1f7a8c',
    accentHover: '#186470',
  },
};

export const DEFAULT_THEME = MODULE_THEMES['panel-schedule'];

export function getModuleTheme(moduleId: string): ModuleTheme {
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
