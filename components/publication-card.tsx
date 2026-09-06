import Link from 'next/link';

export const title = 'Gravitational Transport Robustness in the Earth–Moon CR3BP';
export const description = 'Exploring the stability of gravitational transport in the Earth–Moon system, and how orbital pathways respond to perturbations in the circular restricted three-body problem.';

export function Tags() {
  return <div className="tags"><span>Research</span><span>Research in progress</span></div>;
}

export function PaperCard() {
  return <article className="paper-card"><Tags/><h2><Link className="publication-title" href="/papers/gravitational-transport">{title}</Link></h2><p>{description}</p></article>;
}
