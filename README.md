# Bloho Labs

Standard Next.js App Router application. Requires Node.js 22.13 or later.

## Local development

```sh
npm ci
npm run dev
```

## Production

```sh
npm run build
npm start
```

Next.js manages its default `.next` build output. The `app/` routes, components,
styles, fonts, and public assets are shared between development and production.

## Vercel

Import this repository with the **Next.js** framework preset. Select the repository
root as the Root Directory and leave Build Command, Install Command, and Output
Directory at their framework defaults. Remove any existing dashboard override
that points to `dist`, `dist/client`, or `public` as the output directory.

No `vercel.json`, SPA fallback rewrite, custom server, or Cloudflare adapter is
needed. Next.js handles direct requests to `/articles`, `/research`, and the
other App Router routes natively. The animation shader and fonts are served from
`public/` by the same application.

## Content publishing

See [content/README.md](content/README.md) for copyable paper, external article,
and blog templates, validation commands, and failure-isolation behavior.
