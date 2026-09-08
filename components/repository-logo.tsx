'use client';

import { useEffect, useState } from 'react';

type Repository = 'zenodo' | 'vixra';

function isDarkTheme() {
  const selected = document.documentElement.dataset.theme;
  return selected === 'dark' || (selected !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function RepositoryLogo({ repository }: { repository: Repository }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(isDarkTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);

  const label = repository === 'zenodo' ? 'Zenodo' : 'viXra';
  return <img className="repository-logo" src={`/utilities/${repository}-${dark ? 'white' : 'black'}.svg`} alt={label} width="70" height="26" />;
}
