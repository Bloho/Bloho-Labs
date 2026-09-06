import { PaperCard } from '../page';
export const metadata={title:'Research — Bloho Labs'};
export default function Research(){return <section className="listing"><div className="breadcrumb">→ Research</div>{[0,1,2].map(i=><PaperCard key={i}/>)}<div className="listing-space"/></section>}
