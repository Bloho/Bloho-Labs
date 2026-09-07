# Publishing content

Content lives here. Do not duplicate files inside `app/` to publish an entry.
The three collections are independent:

| Folder | Copy this file | Published destination |
| --- | --- | --- |
| `content/papers/` | `_template.json` | `/papers/your-filename` |
| `content/articles/` | `_template.json` | `/articles/your-filename` redirects to `externalUrl` |
| `content/blogs/` | `_template.json` | `/blogs/your-filename` |

## Add an entry

1. Duplicate the appropriate `_template.json` in the same folder.
2. Rename the copy, for example `orbital-stability.json`. Use lowercase letters,
   numbers, and hyphens. The filename becomes its unique URL; no separate slug
   field is needed. Templates beginning with `_` are always ignored.
3. Fill in `title`, `summary`, `author`, and `date`. Keep `draft: true` while editing.
4. For a paper, set its research `status`, optional `fund`, ORCID profile URL and
   viXra paper URL. Set unknown values to `null` or an empty string. Only papers
   get the **Research** pill. Set `featured: true` to prefer it on the homepage;
   if several are featured, the newest wins.
5. For a research article, replace `externalUrl` with the actual HTTPS URL of
   that article on your other website. There is no embedded copy of that site.
6. For a blog, fill `body` with paragraph, heading, or quote blocks. Each block
   has a `type` and a `text` string. Use `\n` inside text for line breaks. Content
   is plain text, not executable HTML, Markdown, MDX, or JavaScript.
7. Optional thumbnail: put an image in `public/uploads/`, then set `thumbnail`
   to `/uploads/your-image.webp`. PNG, JPEG, WebP, AVIF, and GIF are supported.
   Use a wide image around 1222 × 482 for the supplied layouts. Missing images
   leave a neutral white cover of exactly the same height.
8. Set `draft: false`, then run `npm run content:check`.
9. Commit your content and assets and redeploy on Vercel. Production indexes
   are built during deployment; editing a local file does not update a live site.

Use `YYYY-MM-DD` for paper dates. For blogs include an explicit timezone, e.g.
`2026-09-07T15:35:00+05:30`. Display dates use Asia/Kolkata consistently.

## What happens when something goes wrong?

- Invalid JSON, wrong required types, invalid dates, or missing required fields:
  only that entry is skipped. Its URL returns 404; other pages keep working.
- No `draft` flag or an invalid flag: the entry stays unpublished.
- Drafts and `_template.json` files are not listed or accessible at a detail URL.
- Invalid optional links disappear; missing or broken thumbnails use a blank cover.
- Bad blog blocks are omitted; a blog with no readable blocks is skipped.
- Empty/missing collections show an empty state. The homepage handles zero papers.
- Files over 256 KB are skipped. Symlinks and subfolders are not followed.
- Unknown extra fields are ignored. Copying an entry with the same title is safe;
  filenames, not titles, define URLs. Renaming a file changes its URL.
- External links must use HTTPS. ORCID/viXra fields also validate their domains.
- Entries are parsed independently at runtime rather than imported as modules.
  A malformed JSON file cannot become a JavaScript compilation failure.

`npm run content:check` reports file-specific errors and exits nonzero so you
can catch mistakes before publishing. These diagnostics do **not** block
`npm run build`; its prebuild check prints warnings only. Drafts are intentionally
not validated until you set `draft: false` (except malformed JSON, which is reported).
Run `npm run test:content` for the regression tests.

This protects against content errors, not every possible outage: changing app
code, exhausting disk space, deleting dependencies, or hosting failures can still
break a deployment. Keep content in Git so mistakes can be restored.

## Rendering architecture

- `lib/content.ts`: independent file reading, validation, normalization, diagnostics.
- `components/content-templates.tsx`: paper and blog layouts.
- `components/content-cover.tsx`: image failure fallback.
- `components/content-list.tsx`: shared collection listing and empty state.
- `app/papers/[slug]/page.tsx`: research paper detail and metadata.
- `app/blogs/[slug]/page.tsx`: blog detail and metadata.
- `app/articles/[slug]/route.ts`: validated external 307 redirect.
- `next.config.ts`: traces content JSON into Vercel server deployments.

`/research` remains the existing papers index; `/papers` is also supported.
`/articles` lists external research articles and `/blogs` lists general blogs.
The existing two paper URLs are preserved. External article and blog collections
start empty because no real external URLs or blog text have been supplied.
