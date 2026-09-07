'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function Header() {
  const path = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current!;
    let previousY = Math.max(0, window.scrollY);
    let travel = 0;
    let direction = 0;
    let frame = 0;
    header.dataset.compact = String(previousY > 48);

    const update = () => {
      frame = 0;
      // Clamp overscroll so the elastic bounce at either end cannot flip the bar.
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(maxY, Math.max(0, window.scrollY));
      const delta = y - previousY;
      previousY = y;
      if (y <= 24) {
        header.dataset.compact = 'false';
        travel = 0;
        return;
      }
      if (Math.abs(delta) < .5) return;
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) travel = 0;
      direction = nextDirection;
      travel += Math.abs(delta);
      // A small dead zone avoids jitter from trackpads and slow scroll reversals.
      if (travel >= 12) {
        header.dataset.compact = String(direction > 0 && y > 48);
        travel = 0;
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [path]);

  return <header ref={headerRef} className="site-header"><div className="header-inner"><Link href="/" aria-label="Bloho Labs home"><Image src="/assets/labs.svg" alt="labs" width={127} height={42} unoptimized/></Link><nav aria-label="Main navigation"><Link href="/research" aria-current={(path.startsWith('/research') || path.startsWith('/papers')) ? 'page' : undefined}>Research</Link><Link href="/articles" aria-current={path.startsWith('/articles') ? 'page' : undefined}>Articles</Link><Link href="/blogs" aria-current={path.startsWith('/blogs') ? 'page' : undefined}>Blogs</Link></nav></div></header>;
}
