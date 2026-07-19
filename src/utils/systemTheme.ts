const DARK_QUERY = '(prefers-color-scheme: dark)';

export const getSystemPrefersDark = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
};

export const subscribeToSystemTheme = (onChange: (isDark: boolean) => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DARK_QUERY);
  const listener = (e: MediaQueryListEvent) => onChange(e.matches);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
};
