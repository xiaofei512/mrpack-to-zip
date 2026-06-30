# MRPACK to ZIP Converter

Static Vite tool for converting Modrinth `.mrpack` files into regular ZIP packages in the browser.

## Scope

- Upload `.mrpack`, paste a direct `.mrpack` URL, or enter a Modrinth project ID/slug/URL.
- Generate Client ZIP or Server ZIP.
- Process local files in the browser.
- Fetch remote files directly from the browser.
- No backend proxy, no account, no mod hosting.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

## SEO and Analytics

Set these before a production SEO validation build:

```bash
VITE_PUBLIC_SITE_URL=https://your-final-domain.example
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

The temporary Cloudflare Pages domain is for smoke testing only. Formal SEO validation starts after the final domain is configured, then `robots.txt`, `sitemap.xml`, canonical, and Open Graph URLs should be updated to that domain.

## Cloudflare Pages

- Framework preset: `Vite`
- Build command: `pnpm build`
- Output directory: `dist`

The `public/_redirects` file makes `/` and `/mrpack-to-zip` render the same static app.
