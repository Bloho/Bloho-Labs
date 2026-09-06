import { PaperCard } from '../page';
export const metadata={title:'Articles — Bloho Labs'};
export default function Articles(){return <section className="listing"><div className="breadcrumb">→ Articles</div>{[0,1,2].map(i=><PaperCard key={i}/>)}<div className="listing-space"/></section>}
