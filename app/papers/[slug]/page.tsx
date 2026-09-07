import { notFound } from 'next/navigation';
import { getEntry } from '@/lib/content';
import { PaperTemplate } from '@/components/content-templates';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const entry = getEntry('papers', (await params).slug);
  return { title: entry ? `${entry.title} — Bloho Labs` : 'Paper not found — Bloho Labs', description: entry?.summary };
}
export default async function Paper({ params }: Props) {
  const entry = getEntry('papers', (await params).slug);
  if (!entry) notFound();
  return <PaperTemplate entry={entry}/>;
}
