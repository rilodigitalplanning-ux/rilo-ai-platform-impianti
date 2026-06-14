// ─────────────────────────────────────────────────────────────────────────────
// Module Theme Config — Per-module color palette
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleTheme {
  /** Sidebar background (darker base) */
  primary: string;
  /** Darker variant for hover / dark mode sidebar */
  dark: string;
  /** Accent used for active tabs, icons, highlights */
  accent: string;
  /** Lighter accent for hover states */
  accentHover: string;
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  cablefill: {
    primary:     '#401318',
    dark:        '#2E0E11',
    accent:      '#81292C',
    accentHover: '#6A2023',
  },
};

export const DEFAULT_THEME: ModuleTheme = MODULE_THEMES['cablefill'];

export function getModuleTheme(moduleId: string | null): ModuleTheme {
  if (!moduleId) return DEFAULT_THEME;
  return MODULE_THEMES[moduleId] ?? DEFAULT_THEME;
}
