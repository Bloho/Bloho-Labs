'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const valid = (value: string | null): Theme => value === 'light' || value === 'dark' ? value : 'system';

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    setTheme(valid(document.documentElement.dataset.theme || null));
    const sync = (event: StorageEvent) => {
      if (event.key === 'bloho-theme' || event.key === null) {
        const next = valid(event.newValue);
        document.documentElement.dataset.theme = next;
        setTheme(next);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <div className="theme-control" role="group" aria-label="Color theme">
    {(['light', 'dark', 'system'] as const).map(option => <button key={option} type="button" aria-pressed={theme === option} onClick={() => {
      setTheme(option);
      document.documentElement.dataset.theme = option;
      try { localStorage.setItem('bloho-theme', option); } catch { /* Session theme still works if storage is blocked. */ }
    }}>{option[0].toUpperCase() + option.slice(1)}</button>)}
  </div>;
}
