# MRPACK to ZIP Converter

Static Vite tool for converting Modrinth `.mrpack` files into regular ZIP packages in the browser.

## Scope

- Upload `.mrpack`, paste a direct `.mrpack` URL, or enter a Modrinth project ID/slug/URL.
- Generate the recommended Launcher ZIP or the advanced Server ZIP.
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
VITE_PUBLIC_SITE_URL=https://mrpacktozip.net
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENV=production
VITE_CLARITY_PROJECT_ID=your-clarity-project-id
```

The production canonical URL is `https://mrpacktozip.net/`. Keep `robots.txt`, `sitemap.xml`, canonical, Open Graph, and JSON-LD URLs aligned to this root URL.
Analytics is opt-in: the production build loads Google Analytics and Microsoft Clarity only after consent. Keep `VITE_ANALYTICS_ENABLED=true`, `VITE_ANALYTICS_ENV=production`, and `VITE_CLARITY_PROJECT_ID` in the Cloudflare Pages Production environment only; leave them unset for Local and Preview builds. The privacy page documents the analytics and cookie boundaries, including Clarity's possible visibility of page content after consent.

## Cloudflare Pages

- Framework preset: `Vite`
- Build command: `pnpm build`
- Output directory: `dist`

The `public/_redirects` file redirects `/mrpack-to-zip` to `/`, then serves the static app for all routes.
