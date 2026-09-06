import { PaperCard } from '@/components/publication-card';

export const metadata = { title: 'Research — Bloho Labs' };

export default function Research() {
  return <section className="listing research-listing" aria-labelledby="research-heading"><h1 id="research-heading" className="breadcrumb">→ Research</h1>{[0, 1, 2].map(i => <PaperCard key={i}/>)}<div className="listing-space" aria-hidden="true"/></section>;
}
