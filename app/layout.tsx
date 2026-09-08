import type { Metadata } from 'next';
import './globals.css';
import { Header } from './site-header';
import Link from 'next/link';
import { ThemeControl } from '@/components/theme-control';
export const metadata: Metadata = {title:'Bloho Labs — Research & Articles',description:'Research papers and articles from Bloho Labs.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"(function(){var t='system';try{t=localStorage.getItem('bloho-theme')||t}catch(e){}document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'})()"}}/></head><body><a href="#content" className="skip-link">Skip to content</a><Header/><div className="site-frame"><main id="content">{children}</main><footer><div className="footer-brand"><Link href="/" aria-label="Bloho Labs home"><img src="/assets/bloho-labs.svg" alt="Bloho Labs"/></Link></div><nav aria-label="Footer"><Link href="/about">About</Link><Link href="/legal">Legal</Link><Link href="/terms">Terms</Link></nav><ThemeControl/><p className="copyright">© 2026 All Rights Reserved. Bloho Labs</p></footer></div></body></html>}
