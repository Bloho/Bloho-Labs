import { type Entry, formatDate } from '@/lib/content';
import { ContentCover } from './content-cover';
import { Tags } from './publication-card';
import Image from 'next/image';

function Detail({ label, value }: { label: string; value: string }) {
  return value ? <div className="paper-detail-field"><dt>{label}</dt><dd>{value}</dd></div> : null;
}

export function PaperTemplate({ entry }: { entry: Entry }) {
  const { details, software } = entry;
  const hasDetails = Object.values(details).some(value => value.length > 0);
  const hasSoftware = Object.values(software).some(Boolean);
  return <article className="paper-detail">
    <ContentCover src={entry.thumbnail} title={entry.title}/>
    <div className="paper-intro"><Tags entry={entry}/><h1>{entry.title}</h1><p>{entry.summary}</p></div>
    <section className="paper-facts" aria-label="Publication details">
      <div><p className="paper-author">Author: {entry.author}</p><p>Date of publish: <time dateTime={entry.date}>{formatDate(entry.date)}</time></p>{entry.fund && <p>Fund: {entry.fund}</p>}</div>
      {(entry.orcid || entry.zenodo || entry.vixra) && <div className="paper-links">
        {entry.zenodo && <a href={entry.zenodo} target="_blank" rel="noopener noreferrer" aria-label="View on Zenodo">View on <Image className="repository-logo-light" src="/utilities/zenodo-black.svg" alt="" width={70} height={26}/><Image className="repository-logo-dark" src="/utilities/zenodo-white.svg" alt="" width={70} height={26}/></a>}
        {entry.vixra && <a href={entry.vixra} target="_blank" rel="noopener noreferrer" aria-label="View on viXra">View on <Image className="repository-logo-light" src="/utilities/vixra-black.svg" alt="" width={70} height={26}/><Image className="repository-logo-dark" src="/utilities/vixra-white.svg" alt="" width={70} height={26}/></a>}
        {entry.orcid && <a href={entry.orcid} target="_blank" rel="noopener noreferrer">View on <span className="orcid-word">ORC<span>iD</span></span></a>}
      </div>}
    </section>
    {hasDetails && <section className="paper-additional" aria-labelledby="additional-details">
      <h2 id="additional-details">Additional details</h2>
      <div className="paper-details-columns">
        <dl><Detail label="Resource type" value={details.resourceType}/><Detail label="Publisher" value={details.publisher}/><Detail label="Languages" value={details.languages}/></dl>
        <dl className="paper-details-right">
          {details.identifiers.length > 0 && <div className="paper-detail-field"><dt>Identifiers</dt><dd>{details.identifiers.map((identifier, index) => <span key={index}>{identifier}</span>)}</dd></div>}
          <Detail label="Rights" value={details.rights}/><Detail label="Copyright" value={details.copyright}/>
        </dl>
      </div>
    </section>}
    {hasSoftware && <section className="paper-software" aria-labelledby="paper-software"><h2 id="paper-software">Software</h2><dl>
      {software.repositoryUrl && <div className="paper-detail-field"><dt>Repository URL</dt><dd><a href={software.repositoryUrl} target="_blank" rel="noopener noreferrer">{software.repositoryUrl}</a></dd></div>}
      <Detail label="Programming language" value={software.programmingLanguages}/><Detail label="Development Status" value={software.developmentStatus}/>
    </dl></section>}
    {!hasSoftware && <div className="paper-detail-space"/>}
  </article>;
}
export function BlogTemplate({ entry }: { entry: Entry }) {
  return <article className="blog-detail"><ContentCover src={entry.thumbnail} title={entry.title}/><header className="blog-heading"><h1>{entry.title}</h1><p className="blog-byline">by {entry.author}</p><time dateTime={entry.date}>{formatDate(entry.date, true)}</time></header><div className="blog-body">{entry.body.map((block,i) => block.type === 'heading' ? <h2 key={i}>{block.text}</h2> : block.type === 'quote' ? <blockquote key={i}>{block.text}</blockquote> : <p key={i}>{block.text}</p>)}</div></article>;
}
