import Link from 'next/link';
import LightRails from './light-rails';
import { PaperCard, Tags } from '@/components/publication-card';
import { getEntries, entryHref } from '@/lib/content';
export default function Home() {
  const papers = getEntries('papers');
  const featured = papers.find(entry => entry.featured) || papers[0];
  const related = getEntries().filter(entry => entry !== featured && !(entry.kind === featured?.kind && entry.slug === featured.slug)).slice(0,3);
  return <><section className="featured"><LightRails/>{featured && <PaperCard entry={featured}/>}</section>{related.length > 0 && <section className="related" aria-label="More publications">{related.map(entry => <Link href={entryHref(entry)} className="mini-paper" key={`${entry.kind}/${entry.slug}`} prefetch={entry.kind === 'articles' ? false : undefined}><div className="thumbnail" aria-hidden="true"/><div><Tags entry={entry}/><h2>{entry.title}</h2></div></Link>)}</section>}<div className="home-space"/></>;
}
