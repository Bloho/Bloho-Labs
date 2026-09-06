import { PaperCard } from '@/components/publication-card';

export const metadata = { title: 'Articles — Bloho Labs' };

export default function Articles() {
  return <section className="listing articles-listing" aria-labelledby="articles-heading"><h1 id="articles-heading" className="breadcrumb">→ Articles</h1>{[0, 1, 2].map(i => <PaperCard key={i}/>)}<div className="listing-space" aria-hidden="true"/></section>;
}
