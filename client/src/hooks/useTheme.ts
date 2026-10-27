import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'moc-theme';

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Light / dark / follow-the-system theme, remembered in this browser. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(read);

  useEffect(() => {
    apply(preference);
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setTheme = useCallback((pref: ThemePreference) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* not persisted; still applied for this session */
    }
    setPreference(pref);
  }, []);

  return { preference, setTheme };
}
