export interface ModuleTheme {
  primary: string;
  dark: string;
  accent: string;
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  'impianto-fv': {
    primary: '#4a3b0f',
    dark: '#2a2208',
    accent: '#f2b705',
    accentHover: '#d9a304',
  },
};

export const DEFAULT_THEME = MODULE_THEMES['impianto-fv'];

export function getModuleTheme(moduleId: string): ModuleTheme {
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
