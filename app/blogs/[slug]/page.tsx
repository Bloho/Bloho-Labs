import { notFound } from 'next/navigation';
import { getEntry } from '@/lib/content';
import { BlogTemplate } from '@/components/content-templates';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const entry = getEntry('blogs', (await params).slug);
  return { title: entry ? `${entry.title} — Bloho Labs` : 'Blog not found — Bloho Labs', description: entry?.summary };
}
export default async function Blog({ params }: Props) {
  const entry = getEntry('blogs', (await params).slug);
  if (!entry) notFound();
  return <BlogTemplate entry={entry}/>;
}
