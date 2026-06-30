import { readFileSync } from 'node:fs'
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

describe('static SEO files', () => {
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
  })
})
