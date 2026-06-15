export interface ModuleTheme {
  primary: string;
  dark: string;
  accent: string;
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  'load-analysis': {
    primary: '#1a3a2a',
    dark: '#0f2519',
    accent: '#2d6a4f',
    accentHover: '#245c43',
  },
};

export const DEFAULT_THEME = MODULE_THEMES['load-analysis'];

export function getModuleTheme(moduleId: string): ModuleTheme {
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
