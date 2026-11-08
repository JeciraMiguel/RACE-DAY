import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme, type Theme } from './theme';

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark' as Theme);
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
