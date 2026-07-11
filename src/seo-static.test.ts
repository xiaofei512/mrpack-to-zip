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

  it('keeps visible conversion instructions aligned with HowTo structured data', () => {
    const html = readFileSync('index.html', 'utf8')
    const graph = jsonLdGraph(html)
    const howTo = graph.find((entry: { '@type'?: string }) => entry['@type'] === 'HowTo')
    expect(howTo).toBeTruthy()

    const stepNames = howTo.step.map((step: { name: string }) => step.name)

    expect(stepNames).toEqual([
      'Choose your source',
      'Keep Launcher ZIP selected',
      'Click Convert',
      'Download the result',
      'Review missing files if needed',
    ])
  })

  it('does not rewrite every unknown route to the homepage with a 200 status', () => {
    const redirects = readFileSync('public/_redirects', 'utf8')

    expect(redirects).toContain('/mrpack-to-zip / 301')
    expect(redirects).not.toContain('/* /index.html 200')
  })

  it('publishes a real llms.txt entrypoint for AI crawlers', () => {
    const llms = readFileSync('public/llms.txt', 'utf8')

    expect(llms).toContain('# MRPACK to ZIP Converter')
    expect(llms).toContain('https://mrpacktozip.net/')
    expect(llms).toContain('https://mrpacktozip.net/sitemap.xml')
    expect(llms).toContain('https://mrpacktozip.net/blog/how-to-convert-mrpack-to-zip/')
    expect(llms).toContain('https://mrpacktozip.net/blog/launcher-zip-vs-server-zip/')
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

  it('builds every blog page as an explicit multi-page entry', () => {
    const input = viteConfig.build?.rollupOptions?.input

    expect(input).toBeTruthy()
    expect(JSON.stringify(input)).toContain('blog/index.html')
    expect(JSON.stringify(input)).toContain('blog/how-to-convert-mrpack-to-zip/index.html')
    expect(JSON.stringify(input)).toContain('blog/launcher-zip-vs-server-zip/index.html')
  })

  it('publishes blog URLs in the sitemap', () => {
    const sitemap = readFileSync('public/sitemap.xml', 'utf8')

    expect(sitemap).toContain('https://mrpacktozip.net/')
    expect(sitemap).toContain('https://mrpacktozip.net/blog/')
    expect(sitemap).toContain('https://mrpacktozip.net/blog/how-to-convert-mrpack-to-zip/')
    expect(sitemap).toContain('https://mrpacktozip.net/blog/launcher-zip-vs-server-zip/')
  })

  it('keeps the blog index canonical, linked, and structured', () => {
    const html = readFileSync('blog/index.html', 'utf8')
    const graph = jsonLdGraph(html)

    expect(html).toContain('<link rel="canonical" href="https://mrpacktozip.net/blog/"')
    expect(html).toContain('property="og:url" content="https://mrpacktozip.net/blog/"')
    expect(html).toContain('/blog/how-to-convert-mrpack-to-zip/')
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
        path: 'blog/how-to-convert-mrpack-to-zip/index.html',
        canonical: 'https://mrpacktozip.net/blog/how-to-convert-mrpack-to-zip/',
        title: 'How to Convert MRPACK to ZIP',
        schemaTypes: ['Article', 'HowTo', 'BreadcrumbList'],
        requiredLinks: ['/', '/blog/', '/blog/launcher-zip-vs-server-zip/'],
      },
      {
        path: 'blog/launcher-zip-vs-server-zip/index.html',
        canonical: 'https://mrpacktozip.net/blog/launcher-zip-vs-server-zip/',
        title: 'Launcher ZIP vs Server ZIP for MRPACK Files',
        schemaTypes: ['Article', 'BreadcrumbList'],
        requiredLinks: ['/', '/blog/', '/blog/how-to-convert-mrpack-to-zip/'],
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
