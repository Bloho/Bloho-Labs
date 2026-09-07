import fs from 'node:fs';
import path from 'node:path';

export const kinds = ['papers', 'articles', 'blogs'] as const;
export type Kind = typeof kinds[number];
export type Block = { type: 'paragraph' | 'heading' | 'quote'; text: string };
export type Entry = {
  kind: Kind; slug: string; title: string; summary: string; author: string;
  date: string; status: string; fund: string; thumbnail: string | null;
  orcid: string | null; vixra: string | null; externalUrl: string | null;
  body: Block[]; featured: boolean;
};
export type Issue = { file: string; message: string };
export type Catalog = { entries: Entry[]; issues: Issue[] };
const MAX_BYTES = 256 * 1024;
const text = (value: unknown, max = 2000) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function safeUrl(value: unknown, host?: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (host && url.hostname !== host && url.hostname !== `www.${host}`) return null;
    return url.href;
  } catch { return null; }
}
function imagePath(value: unknown, publicRoot: string): string | null {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9/_ .-]+\.(png|jpe?g|webp|avif|gif)$/i.test(value) || value.includes('..')) return null;
  try { return fs.statSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ publicRoot, value)).isFile() ? value : null; } catch { return null; }
}
function validDate(value: unknown): string {
  const date = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(date)) return '';
  const day = date.slice(0, 10);
  const parsed = new Date(day);
  return Number.isFinite(Date.parse(date)) && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === day ? date : '';
}
// Files are read as data, never imported into the build or executed as JSX/MDX.
// Every filesystem operation, parse, and validation is isolated to one entry.
export function loadContent(root = path.join(process.cwd(), 'content'), publicRoot = path.join(process.cwd(), 'public')): Catalog {
  const entries: Entry[] = [], issues: Issue[] = [];
  for (const kind of kinds) {
    let files: fs.Dirent[];
    try { files = fs.readdirSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root, kind), { withFileTypes: true }); }
    catch { issues.push({ file: kind, message: 'Folder missing or unreadable; collection is empty.' }); continue; }
    for (const file of files.sort((a,b) => a.name.localeCompare(b.name))) {
      if (!file.isFile() || file.name.startsWith('_') || !file.name.endsWith('.json')) continue;
      const label = `${kind}/${file.name}`;
      const issue = (message: string) => issues.push({ file: label, message });
      try {
        const slug = file.name.slice(0, -5);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) { issue('Filename must be a lowercase hyphenated slug.'); continue; }
        const full = path.join(/* turbopackIgnore: true */ root, kind, file.name);
        if (fs.statSync(/* turbopackIgnore: true */ full).size > MAX_BYTES) { issue('File exceeds 256 KB; skipped.'); continue; }
        const raw: unknown = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ full, 'utf8'));
        if (!object(raw)) { issue('Entry must be a JSON object.'); continue; }
        if (raw.draft === true) continue;
        if (raw.draft !== false) { issue('Set draft explicitly to false to publish, or true to keep hidden.'); continue; }
        const title = text(raw.title, 250), summary = text(raw.summary), author = text(raw.author, 160), date = validDate(raw.date);
        if (!title || !summary || !author || !date) { issue('Missing or invalid title, summary, author, or ISO date; skipped.'); continue; }
        const externalUrl = safeUrl(raw.externalUrl);
        if (kind === 'articles' && !externalUrl) { issue('Research articles require a valid HTTPS externalUrl; skipped.'); continue; }
        const body: Block[] = [];
        if (Array.isArray(raw.body)) {
          for (const block of raw.body.slice(0, 300)) {
            if (object(block) && ['paragraph','heading','quote'].includes(String(block.type)) && text(block.text, 20000)) body.push({ type: block.type as Block['type'], text: text(block.text, 20000) });
            else issue('Invalid body block omitted.');
          }
        }
        if (kind === 'blogs' && body.length === 0) { issue('Blog needs at least one valid body block; skipped.'); continue; }
        const thumbnail = imagePath(raw.thumbnail, publicRoot);
        if (raw.thumbnail && !thumbnail) issue('Thumbnail missing or invalid; neutral cover used.');
        const orcid = safeUrl(raw.orcid, 'orcid.org'), vixra = safeUrl(raw.vixra, 'vixra.org');
        if (raw.orcid && !orcid) issue('Invalid ORCID link omitted.');
        if (raw.vixra && !vixra) issue('Invalid viXra link omitted.');
        entries.push({ kind, slug, title, summary, author, date, externalUrl, body, thumbnail, orcid, vixra,
          status: text(raw.status, 80), fund: text(raw.fund, 160), featured: raw.featured === true });
      } catch { issue('Invalid JSON or unreadable file; entry skipped.'); }
    }
  }
  entries.sort((a,b) => Date.parse(b.date) - Date.parse(a.date) || a.slug.localeCompare(b.slug));
  return { entries, issues };
}
export function getEntries(kind?: Kind): Entry[] { return loadContent().entries.filter(entry => !kind || entry.kind === kind); }
export function getEntry(kind: Kind, slug: string): Entry | undefined { return getEntries(kind).find(entry => entry.slug === slug); }
export function entryHref(entry: Entry): string { return `/${entry.kind}/${entry.slug}`; }
export function formatDate(date: string, withTime = false): string {
  return new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata', ...(withTime ? { hour:'numeric',minute:'2-digit',hour12:true } : {}) }).format(new Date(date)) + (withTime ? ' IST' : '');
}
