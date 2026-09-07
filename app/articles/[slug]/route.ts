import { getEntry } from '@/lib/content';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const entry = getEntry('articles', (await params).slug);
  if (!entry?.externalUrl) return new Response('Article not found', { status: 404 });
  // Temporary redirect: changing the destination later must not be browser-cached forever.
  return new Response(null, { status: 307, headers: { Location: entry.externalUrl, 'Cache-Control': 'no-store' } });
}
