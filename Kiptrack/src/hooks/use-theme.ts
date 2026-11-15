import { useMemo } from 'react';

import { Colors, type ThemeScheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePreferences } from '@/state/preferences';

/** System appearance, unless the user picked an override in Settings. */
export function useResolvedScheme(): ThemeScheme {
  const systemScheme = useColorScheme();
  const { preference } = usePreferences();

  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  const scheme = useResolvedScheme();
  return useMemo(() => Colors[scheme], [scheme]);
}
