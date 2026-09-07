import Link from 'next/link';
import { entryHref, type Entry } from '@/lib/content';

export function Tags({ entry }: { entry: Entry }) {
  return <div className="tags"><span>{entry.kind === 'papers' ? 'Research' : entry.kind === 'articles' ? 'Research article' : 'Blog'}</span>{entry.status && <span>{entry.status}</span>}</div>;
}
export function PaperCard({ entry }: { entry: Entry }) {
  return <article className="paper-card"><Tags entry={entry}/><h2><Link className="publication-title" href={entryHref(entry)} prefetch={entry.kind === 'articles' ? false : undefined}>{entry.title}</Link></h2><p>{entry.summary}</p></article>;
}
