// @vitest-environment jsdom
import { fireEvent, getByLabelText, getByRole, getByText, waitFor } from '@testing-library/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from './app'
import type { ConversionResult } from './lib/mrpack'

function result(overrides: Partial<ConversionResult> = {}): ConversionResult {
  return {
    status: 'partial',
    packName: 'Fixture Pack',
    packVersion: '1.0.0',
    target: 'client',
    filesTotal: 2,
    filesDownloaded: 1,
    filesFailed: 1,
    zipBlob: new Blob(['zip']),
    missingFiles: [
      {
        path: 'mods/missing.jar',
        reason: 'download_failed',
        message: 'The file could not be downloaded by this browser.',
      },
    ],
    warnings: [],
    ...overrides,
  }
}

describe('renderApp', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the MRPACK conversion controls, FAQ, and independent disclaimer', () => {
    const root = document.createElement('div')
    document.body.append(root)

    renderApp(root)

    expect(getByRole(root, 'heading', { level: 1, name: 'MRPACK to ZIP Converter' })).toBeTruthy()
    expect(getByLabelText(root, 'Upload .mrpack file')).toBeTruthy()
    expect(getByLabelText(root, 'Paste .mrpack download URL')).toBeTruthy()
    expect(getByLabelText(root, 'Modrinth project ID, slug, or URL')).toBeTruthy()
    expect((getByRole(root, 'radio', { name: 'Client ZIP' }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(getByRole(root, 'radio', { name: 'Server ZIP' })).toBeTruthy()
    expect(getByRole(root, 'button', { name: /Convert to ZIP/i })).toBeTruthy()
    expect(getByText(root, 'Why are some mods missing from the ZIP?')).toBeTruthy()
    expect(getByText(root, /not affiliated with Modrinth/i)).toBeTruthy()
  })

  it('runs project conversions and tracks only aggregate analytics fields', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () => result())
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })

    const projectInput = getByLabelText(root, 'Modrinth project ID, slug, or URL') as HTMLInputElement
    fireEvent.input(projectInput, {
      target: { value: 'https://modrinth.com/modpack/fabulously-optimized' },
    })
    fireEvent.click(getByRole(root, 'button', { name: /Convert to ZIP/i }))

    await waitFor(() => expect(convertMrpack).toHaveBeenCalled())
    await waitFor(() => expect(getByText(root, 'Partial ZIP ready')).toBeTruthy())

    expect(convertMrpack).toHaveBeenCalledWith(
      {
        kind: 'project',
        projectIdOrSlugOrUrl: 'https://modrinth.com/modpack/fabulously-optimized',
      },
      expect.objectContaining({ target: 'client' }),
    )
    expect(trackEvent).toHaveBeenCalledWith('project_submitted', {
      input_type: 'project',
      target: 'client',
    })
    expect(trackEvent).toHaveBeenCalledWith('convert_partial', {
      input_type: 'project',
      target: 'client',
      status: 'partial',
      failure_reason: 'download_failed',
      file_count_bucket: '1-10',
    })
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain('fabulously-optimized')
  })
})
