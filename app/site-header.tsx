'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function Header(){const path=usePathname();return <header className="site-header"><div className="header-inner"><Link href="/" aria-label="Bloho Labs home"><img src="/assets/labs.svg" alt="labs"/></Link><nav aria-label="Main navigation"><Link href="/research" aria-current={path.startsWith('/research')?'page':undefined}>Research</Link><Link href="/articles" aria-current={path.startsWith('/articles')?'page':undefined}>Articles</Link></nav></div></header>}
