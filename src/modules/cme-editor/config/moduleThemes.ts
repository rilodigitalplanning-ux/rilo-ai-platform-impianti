export interface ModuleTheme {
  primary: string;
  dark: string;
  accent: string;
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  'cme-editor': {
    primary: '#2b2d42',
    dark: '#1a1b2b',
    accent: '#6c63ff',
    accentHover: '#5a52e0',
  },
};

export const DEFAULT_THEME = MODULE_THEMES['cme-editor'];

export function getModuleTheme(moduleId: string): ModuleTheme {
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
