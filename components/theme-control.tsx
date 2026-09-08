'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';

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
  return <div className="theme-control">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="mode-toggle" aria-label="Toggle theme"/>}>
        <Sun className="theme-sun" aria-hidden="true"/>
        <Moon className="theme-moon" aria-hidden="true"/>
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="theme-menu">
        <DropdownMenuRadioGroup value={theme} onValueChange={value => {
          const next = valid(value);
          setTheme(next);
          document.documentElement.dataset.theme = next;
          try { localStorage.setItem('bloho-theme', next); } catch { /* Session theme still works if storage is blocked. */ }
        }}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
