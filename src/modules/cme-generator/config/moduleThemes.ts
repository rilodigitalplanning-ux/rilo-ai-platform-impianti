export interface ModuleTheme {
  primary: string;
  dark: string;
  accent: string;
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  'cme-generator': {
    primary: '#0F3460',
    dark: '#091F3D',
    accent: '#E94560',
    accentHover: '#D23A54',
  },
};

export const DEFAULT_THEME = MODULE_THEMES['cme-generator'];

export function getModuleTheme(moduleId: string): ModuleTheme {
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
