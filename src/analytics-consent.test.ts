import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'

const loader = readFileSync(new URL('../public/analytics-consent.js', import.meta.url), 'utf8')
const measurementId = 'G-TEST000001'
const consentKey = 'mrpack_analytics_consent_v1'
const windows: JSDOM[] = []

afterEach(() => windows.splice(0).forEach((dom) => dom.window.close()))

function fixture(choice?: string, enabled = 'true', environment = 'production') {
  const errors: Error[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => errors.push(error))
  const dom = new JSDOM(`<script data-analytics-consent
    data-analytics-enabled="${enabled}" data-analytics-env="${environment}"
    data-ga-measurement-id="${measurementId}"></script>`, {
    url: 'https://example.test/',
    // Execute only the local loader explicitly; no external scripts or requests.
    runScripts: 'outside-only',
    virtualConsole,
  })
  windows.push(dom)
  const win = dom.window
  if (choice) win.localStorage.setItem(consentKey, choice)
  win.eval(loader)
  const click = (action: string) => win.document.querySelector<HTMLButtonElement>(`[data-analytics-${action}]`)!.click()
  const commands = () => (win.dataLayer ?? []).map((entry: ArrayLike<unknown>) => Array.from(entry))
  const tags = () => win.document.querySelectorAll('script[data-analytics-loader="google-analytics"]')
  return { win, click, commands, tags, errors }
}

describe('consent-gated Google tag queue (synthetic ID, no network)', () => {
  it.each([
    ['false', 'production'], ['true', 'local'], ['true', 'preview'],
  ])('stays disabled for enabled=%s environment=%s', (enabled, environment) => {
    const f = fixture('granted', enabled, environment)
    expect(f.win.gtag).toBeUndefined()
    expect(f.tags()).toHaveLength(0)
    expect(f.win.document.querySelector('.analytics-consent')).toBeNull()
  })

  it.each([undefined, 'denied'])('does not queue or load before consent: %s', (choice) => {
    const f = fixture(choice)
    expect(f.win.gtag).toBeUndefined()
    expect(f.commands()).toEqual([])
    expect(f.tags()).toHaveLength(0)
    f.click('decline')
    expect(f.win.localStorage.getItem(consentKey)).toBe('denied')
    expect(f.tags()).toHaveLength(0)
    expect(f.errors).toEqual([])
  })

  it.each([undefined, 'granted'])('uses the documented Arguments queue after grant: %s', (choice) => {
    const f = fixture(choice)
    f.click('allow')
    f.click('allow')
    expect(f.win.localStorage.getItem(consentKey)).toBe('granted')
    expect(f.tags()).toHaveLength(1)
    expect(f.tags()[0]?.getAttribute('src')).toBe(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)
    expect(f.commands().map((command: unknown[]) => command[0])).toEqual(['consent', 'consent', 'js', 'config'])
    expect(f.commands()[0]).toEqual(['consent', 'default', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })])
    expect(f.commands()[1]).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })])
    expect(f.commands()[3]).toEqual(['config', measurementId])
    f.win.gtag('event', 'convert_success', { input_type: 'upload', target: 'client', status: 'success' })
    expect(f.commands().at(-1)).toEqual(['event', 'convert_success', { input_type: 'upload', target: 'client', status: 'success' }])
    // Array.from alone would conceal the broken Array-versus-Arguments protocol.
    for (const entry of f.win.dataLayer) {
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]')
    }
    expect(f.errors).toEqual([])
  })

  it('withdraws consent, disables GA and requests a reload to end the runtime', () => {
    const f = fixture('granted')
    f.click('decline')
    expect(f.win.localStorage.getItem(consentKey)).toBe('denied')
    expect(f.win[`ga-disable-${measurementId}`]).toBe(true)
    expect(f.commands().at(-1)).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })])
    // JSDOM records the reload attempt but cannot navigate; it sends no request.
    expect(f.errors).toHaveLength(1)
    expect(f.errors[0]?.message).toContain('Not implemented: navigation')
  })
})
