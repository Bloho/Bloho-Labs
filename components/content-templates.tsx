import { type Entry, formatDate } from '@/lib/content';
import { ContentCover } from './content-cover';
import { Tags } from './publication-card';
export function PaperTemplate({ entry }: { entry: Entry }) {
  return <article className="paper-detail"><ContentCover src={entry.thumbnail} title={entry.title}/><div className="paper-intro"><Tags entry={entry}/><h1>{entry.title}</h1><p>{entry.summary}</p></div><section className="paper-facts" aria-label="Publication details"><div><p className="paper-author">Author: {entry.author}</p><p>Date of publish: <time dateTime={entry.date}>{formatDate(entry.date)}</time></p>{entry.fund && <p>Fund: {entry.fund}</p>}</div>{(entry.orcid || entry.zenodo || entry.vixra) && <div className="paper-links">{entry.orcid && <a href={entry.orcid} target="_blank" rel="noopener noreferrer">View on <span className="orcid-word">ORC<span>iD</span></span></a>}{entry.zenodo && <a href={entry.zenodo} target="_blank" rel="noopener noreferrer">View on <strong>Zenodo</strong></a>}{entry.vixra && <a href={entry.vixra} target="_blank" rel="noopener noreferrer">View on <strong>viXra</strong></a>}</div>}</section><div className="paper-detail-space"/></article>;
}
export function BlogTemplate({ entry }: { entry: Entry }) {
  return <article className="blog-detail"><ContentCover src={entry.thumbnail} title={entry.title}/><header className="blog-heading"><h1>{entry.title}</h1><p className="blog-byline">by {entry.author}</p><time dateTime={entry.date}>{formatDate(entry.date, true)}</time></header><div className="blog-body">{entry.body.map((block,i) => block.type === 'heading' ? <h2 key={i}>{block.text}</h2> : block.type === 'quote' ? <blockquote key={i}>{block.text}</blockquote> : <p key={i}>{block.text}</p>)}</div></article>;
}
