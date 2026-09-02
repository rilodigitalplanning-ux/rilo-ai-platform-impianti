export interface ModuleTheme {
  primary: string;
  dark: string;
  accent: string;
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  'pdf-dxf': {
    primary: '#4a3416',
    dark: '#2b1e0c',
    accent: '#d97e1c',
    accentHover: '#c06d15',
  },
};

export const DEFAULT_THEME = MODULE_THEMES['pdf-dxf'];

export function getModuleTheme(moduleId: string): ModuleTheme {
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
