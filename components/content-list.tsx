import { getEntries, type Kind } from '@/lib/content';
import { PaperCard } from './publication-card';
export function ContentList({ kind, title }: { kind: Kind; title: string }) {
  const entries = getEntries(kind);
  return <section className="listing" aria-labelledby="collection-title"><h1 className="breadcrumb" id="collection-title">→ {title}</h1>{entries.map(entry => <PaperCard entry={entry} key={entry.slug}/>)}{entries.length === 0 && <p className="collection-empty">No {title.toLowerCase()} published yet.</p>}<div className="listing-space" aria-hidden="true"/></section>;
}
