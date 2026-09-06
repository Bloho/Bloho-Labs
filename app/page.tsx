import Link from 'next/link';
import LightRails from './light-rails';
import { PaperCard } from '@/components/publication-card';
export default function Home(){return <><section className="featured"><LightRails/><PaperCard/></section><section className="related" aria-label="More research">{[0,1,2].map(i=><Link href="/papers/fin-geometry" className="mini-paper" key={i}><div className="thumbnail" aria-hidden="true"/><div><div className="tags"><span>Research</span></div><h2>Parametric Analysis of Fin Geometry Effects on Stability and Performance of a Model Rocket</h2></div></Link>)}</section><div className="home-space"/></>}
