import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config'

function staticMarkupPlugin() {
  const plugins = Array.isArray(viteConfig.plugins) ? viteConfig.plugins : [viteConfig.plugins]
  const plugin = plugins.find((entry) => entry && 'name' in entry && entry.name === 'static-app-markup')

  if (!plugin || !('transformIndexHtml' in plugin)) {
    throw new Error('Missing static-app-markup plugin.')
  }

  return plugin
}

function jsonLdGraph(html: string) {
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]

  if (!jsonLd) {
    throw new Error('Missing JSON-LD script.')
  }

  return JSON.parse(jsonLd)['@graph']
}

describe('static SEO files', () => {
  it('keeps the homepage font path local and free of render-blocking font stylesheets', () => {
    const html = readFileSync('index.html', 'utf8')
    const styles = readFileSync('src/style.css', 'utf8')

    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(styles).not.toContain('Playfair Display')
    expect(styles).not.toContain('JetBrains Mono')
  })

  it('keeps homepage application, publisher, and website entities connected', () => {
    const html = readFileSync('index.html', 'utf8')
    const graph = jsonLdGraph(html)
    const app = graph.find((entry: { '@type'?: string }) => entry['@type'] === 'WebApplication')
    const organization = graph.find((entry: { '@type'?: string }) => entry['@type'] === 'Organization')
    const website = graph.find((entry: { '@type'?: string }) => entry['@type'] === 'WebSite')

    expect(app?.publisher?.['@id']).toBe('%VITE_PUBLIC_SITE_URL%/#organization')
    expect(app?.isPartOf?.['@id']).toBe('%VITE_PUBLIC_SITE_URL%/#website')
    expect(organization?.['@id']).toBe('%VITE_PUBLIC_SITE_URL%/#organization')
    expect(organization?.logo?.url).toBe('%VITE_PUBLIC_SITE_URL%/logo.svg')
    expect(organization?.logo?.width).toBe(512)
    expect(website?.publisher?.['@id']).toBe('%VITE_PUBLIC_SITE_URL%/#organization')
    expect(graph.some((entry: { '@type'?: string }) => entry['@type'] === 'HowTo')).toBe(false)
    expect(graph.some((entry: { '@type'?: string }) => entry['@type'] === 'FAQPage')).toBe(false)
  })

  it('does not rewrite every unknown route to the homepage with a 200 status', () => {
    const redirects = readFileSync('public/_redirects', 'utf8')

    expect(redirects).toContain('/mrpack-to-zip / 301')
    expect(redirects).toContain('/blog/how-to-convert-mrpack-to-zip / 301')
    expect(redirects).toContain('/blog/how-to-convert-mrpack-to-zip/ / 301')
    expect(redirects).not.toContain('/* /index.html 200')
  })

  it('publishes a real llms.txt entrypoint for AI crawlers', () => {
    const llms = readFileSync('public/llms.txt', 'utf8')

    expect(llms).toContain('# MRPACK to ZIP Converter')
    expect(llms).toContain('https://mrpacktozip.net/')
    expect(llms).toContain('https://mrpacktozip.net/sitemap.xml')
    expect(llms).toContain('https://mrpacktozip.net/blog/mrpack-conversion-errors/')
    expect(llms).not.toContain('https://mrpacktozip.net/blog/how-to-convert-mrpack-to-zip/')
    expect(llms).toContain('https://mrpacktozip.net/blog/launcher-zip-vs-server-zip/')
    expect(llms).toContain('https://mrpacktozip.net/about/')
    expect(llms).toContain('https://mrpacktozip.net/privacy/')
    expect(llms).toContain('not affiliated with Modrinth')
  })

  it('injects static app markup at build time and fails if the placeholder drifts', () => {
    const plugin = staticMarkupPlugin()
    const transform = plugin.transformIndexHtml

    if (typeof transform !== 'function') {
      throw new Error('Unexpected transformIndexHtml shape.')
    }

    expect(transform('<body><div id="app"></div></body>')).toContain('converter-form')
    expect(() => transform('<body><div id="root"></div></body>')).toThrow(/app root/i)
    expect(transform('<body><main>Blog index</main></body>', { path: '/blog/' })).toContain(
      'Blog index',
    )
  })

  it('builds every static content page as an explicit multi-page entry', () => {
    const input = viteConfig.build?.rollupOptions?.input

    expect(input).toBeTruthy()
    expect(JSON.stringify(input)).toContain('blog/index.html')
    expect(JSON.stringify(input)).toContain('blog/mrpack-conversion-errors/index.html')
    expect(JSON.stringify(input)).not.toContain('blog/how-to-convert-mrpack-to-zip/index.html')
    expect(JSON.stringify(input)).toContain('blog/launcher-zip-vs-server-zip/index.html')
    expect(JSON.stringify(input)).toContain('about/index.html')
    expect(JSON.stringify(input)).toContain('privacy/index.html')
  })

  it('uses the shared consent-gated analytics loader on every static page', () => {
    const pages = [
      'index.html',
      'blog/index.html',
      'blog/mrpack-conversion-errors/index.html',
      'blog/launcher-zip-vs-server-zip/index.html',
      'about/index.html',
      'privacy/index.html',
    ]

    for (const path of pages) {
      const html = readFileSync(path, 'utf8')
      expect(html).toContain('src="/analytics-consent.js"')
      expect(html).toContain('data-analytics-consent')
      expect(html).toContain('data-analytics-enabled="%VITE_ANALYTICS_ENABLED%"')
      expect(html).toContain('data-analytics-env="%VITE_ANALYTICS_ENV%"')
      expect(html).toContain('data-clarity-project-id="%VITE_CLARITY_PROJECT_ID%"')
      expect(html).not.toContain('googletagmanager.com/gtag/js')
    }
  })

  it('publishes blog URLs in the sitemap', () => {
    const sitemap = readFileSync('public/sitemap.xml', 'utf8')

    expect(sitemap).toContain('https://mrpacktozip.net/')
    expect(sitemap).toContain('https://mrpacktozip.net/blog/')
    expect(sitemap).toContain('https://mrpacktozip.net/blog/mrpack-conversion-errors/')
    expect(sitemap).not.toContain('https://mrpacktozip.net/blog/how-to-convert-mrpack-to-zip/')
    expect(sitemap).toContain('https://mrpacktozip.net/blog/launcher-zip-vs-server-zip/')
    expect(sitemap).toContain('https://mrpacktozip.net/about/')
    expect(sitemap).toContain('https://mrpacktozip.net/privacy/')
  })

  it('keeps the blog index canonical, linked, and structured', () => {
    const html = readFileSync('blog/index.html', 'utf8')
    const graph = jsonLdGraph(html)

    expect(html).toContain('<link rel="canonical" href="https://mrpacktozip.net/blog/"')
    expect(html).toContain('property="og:url" content="https://mrpacktozip.net/blog/"')
    expect(html).toContain('/blog/mrpack-conversion-errors/')
    expect(html).toContain('/blog/launcher-zip-vs-server-zip/')
    expect(html).toContain('%VITE_GA_MEASUREMENT_ID%')
    expect(graph.some((entry: { '@type'?: string }) => entry['@type'] === 'Blog')).toBe(true)
    expect(graph.some((entry: { '@type'?: string }) => entry['@type'] === 'BreadcrumbList')).toBe(
      true,
    )
  })

  it('keeps article pages with unique metadata, schema, internal links, and screenshots', () => {
    const pages = [
      {
        path: 'blog/mrpack-conversion-errors/index.html',
        canonical: 'https://mrpacktozip.net/blog/mrpack-conversion-errors/',
        title: 'MRPACK Conversion Errors: Missing Files, CORS, and Hashes',
        schemaTypes: ['Article', 'BreadcrumbList'],
        requiredLinks: ['/', '/blog/', '/blog/launcher-zip-vs-server-zip/', '/about/', '/privacy/'],
      },
      {
        path: 'blog/launcher-zip-vs-server-zip/index.html',
        canonical: 'https://mrpacktozip.net/blog/launcher-zip-vs-server-zip/',
        title: 'Launcher ZIP vs Server ZIP for MRPACK Files',
        schemaTypes: ['Article', 'BreadcrumbList'],
        requiredLinks: ['/', '/blog/', '/blog/mrpack-conversion-errors/', '/about/', '/privacy/'],
      },
    ]

    for (const page of pages) {
      const html = readFileSync(page.path, 'utf8')
      const graph = jsonLdGraph(html)

      expect(html).toContain(`<link rel="canonical" href="${page.canonical}"`)
      expect(html).toContain(`property="og:url" content="${page.canonical}"`)
      expect(html).toContain(page.title)
      expect(html).toMatch(/<img[\s\S]+alt="[^"]+"/)
      expect(html).toContain('/blog-assets/')
      expect(html).toContain('%VITE_GA_MEASUREMENT_ID%')

      for (const schemaType of page.schemaTypes) {
        expect(graph.some((entry: { '@type'?: string }) => entry['@type'] === schemaType)).toBe(
          true,
        )
      }

      for (const requiredLink of page.requiredLinks) {
        expect(html).toContain(`href="${requiredLink}"`)
      }
    }
  })

  it('keeps the troubleshooting guide distinct from the converter intent', () => {
    const html = readFileSync('blog/mrpack-conversion-errors/index.html', 'utf8')
    const graph = jsonLdGraph(html)
    const article = graph.find((entry: { '@type'?: string }) => entry['@type'] === 'Article')

    expect(html).toContain('<h1>MRPACK Conversion Errors: Missing Files, CORS, and Hashes</h1>')
    expect(html).not.toContain('<h1>How to Convert MRPACK to ZIP</h1>')
    expect(html).toContain('<code>download_failed</code>')
    expect(html).toContain('<code>invalid_response</code>')
    expect(html).toContain('<code>hash_mismatch</code>')
    expect(html).toContain('<code>unsafe_path</code>')
    expect(html).toContain('aria-labelledby="on-this-page"')
    expect(html).toContain('href="#quick-diagnosis"')
    expect(html).toContain('href="#recover-partial"')
    expect(html).toContain('https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack')
    expect(html).toContain('https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS')
    expect(article?.dateModified).toBe('2026-07-11')
    expect(article?.author?.['@id']).toBe('https://mrpacktozip.net/#maintainer')
    expect(article?.publisher?.['@id']).toBe('https://mrpacktozip.net/#organization')
    expect(html).toContain('Maintained and reviewed by')
    expect(graph.some((entry: { '@type'?: string }) => entry['@type'] === 'HowTo')).toBe(false)
  })

  it('publishes transparent About and Privacy pages with stable trust entities', () => {
    const about = readFileSync('about/index.html', 'utf8')
    const privacy = readFileSync('privacy/index.html', 'utf8')
    const aboutGraph = jsonLdGraph(about)
    const privacyGraph = jsonLdGraph(privacy)
    const organization = aboutGraph.find(
      (entry: { '@type'?: string }) => entry['@type'] === 'Organization',
    )
    const maintainer = aboutGraph.find((entry: { '@type'?: string }) => entry['@type'] === 'Person')

    expect(about).toContain('<link rel="canonical" href="https://mrpacktozip.net/about/"')
    expect(about).toContain('<h1>About MRPACK to ZIP</h1>')
    expect(about).toContain('FPS Modpack-3.2.mrpack')
    expect(about).toContain('kedIKix5')
    expect(about).toContain('9 total; 9 downloaded; 0 failed')
    expect(about).toContain('c7e7ec0ebafabd230c7c8adb5cd7a0f71e6568c14e8d8b2c7fd7cadea0876950')
    expect(about).toContain('href="#test-record"')
    expect(organization?.['@id']).toBe('https://mrpacktozip.net/#organization')
    expect(maintainer?.['@id']).toBe('https://mrpacktozip.net/#maintainer')
    expect(maintainer?.url).toBe('https://github.com/xiaofei512')
    expect(about).toContain('mailto:wuguang425@gmail.com?subject=MRPACK%20to%20ZIP%20help')

    expect(privacy).toContain('<link rel="canonical" href="https://mrpacktozip.net/privacy/"')
    expect(privacy).toContain('<h1>How MRPACK to ZIP Handles Data</h1>')
    expect(privacy).toContain('G-PYDQW2NQP0')
    expect(privacy).toContain('do not include the selected filename, pack name, project slug')
    expect(privacy).toContain('https://modrinth.com/legal/privacy')
    expect(privacy).toContain('href="#analytics"')
    expect(privacy).toContain('The checkpoint has no free-text field.')
    expect(privacy).toContain('does not create a separate feedback')
    expect(privacy).toContain('database or store the checkpoint in browser storage')
    expect(privacy).toContain('mailto:wuguang425@gmail.com?subject=MRPACK%20to%20ZIP%20help')
    expect(privacyGraph.some((entry: { '@type'?: string }) => entry['@type'] === 'WebPage')).toBe(
      true,
    )
    expect(privacyGraph.some((entry: { '@type'?: string }) => entry['@type'] === 'BreadcrumbList')).toBe(
      true,
    )
  })

  it('keeps blog screenshot assets available and lightweight', () => {
    const images = [
      'public/blog-assets/mrpack-upload-source.webp',
      'public/blog-assets/mrpack-project-id-source.webp',
      'public/blog-assets/server-zip-toggle.webp',
    ]

    for (const image of images) {
      const stats = statSync(image)

      expect(stats.size).toBeGreaterThan(10_000)
      expect(stats.size).toBeLessThan(100_000)
    }
  })
})
