import Link from 'next/link';
import LightRails from './light-rails';
import { ContentCover } from '@/components/content-cover';
import { PaperCard, Tags } from '@/components/publication-card';
import { getHomepage, entryHref } from '@/lib/content';
export default function Home() {
  const { hero: featured, latest: related } = getHomepage();
  return <><section className="featured"><LightRails/>{featured && <PaperCard entry={featured}/>}</section>{related.length > 0 && <section className="related" aria-label="More publications">{related.map(entry => <Link href={entryHref(entry)} className="mini-paper" key={`${entry.kind}/${entry.slug}`} prefetch={entry.kind === 'articles' ? false : undefined}><ContentCover key={entry.thumbnail} src={entry.thumbnail} title={entry.title} compact/><div><Tags entry={entry}/><h2>{entry.title}</h2></div></Link>)}</section>}<div className="home-space"/></>;
}
