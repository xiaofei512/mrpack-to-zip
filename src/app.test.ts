// @vitest-environment jsdom
import { fireEvent, getByLabelText, getByRole, getByText, waitFor } from '@testing-library/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from './app'
import { ConversionError, type ConversionResult } from './lib/mrpack'

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

function sourcePanel(root: HTMLElement, source: 'project' | 'url' | 'upload') {
  const panel = root.querySelector<HTMLElement>(`[data-source-panel="${source}"]`)

  if (!panel) {
    throw new Error(`Missing source panel: ${source}`)
  }

  return panel
}

describe('renderApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fixture'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('renders source cards, launcher default copy, FAQ, and independent disclaimer', () => {
    const root = document.createElement('div')
    document.body.append(root)

    renderApp(root)

    expect(getByRole(root, 'heading', { level: 1, name: 'MRPACK to ZIP Converter' })).toBeTruthy()
    const primaryNavigation = getByRole(root, 'navigation', { name: 'Primary navigation' })
    expect(primaryNavigation).toBeTruthy()
    expect(getByRole(primaryNavigation, 'link', { name: 'Guides' }).getAttribute('href')).toBe(
      '/blog/',
    )
    expect(getByRole(root, 'link', { name: 'Troubleshooting' }).getAttribute('href')).toBe(
      '/blog/mrpack-conversion-errors/',
    )
    expect((getByRole(root, 'radio', { name: 'Upload File' }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(getByRole(root, 'radio', { name: 'Project ID' })).toBeTruthy()
    expect(getByRole(root, 'radio', { name: 'From URL' })).toBeTruthy()
    expect(getByText(root, 'Launcher ZIP ready')).toBeTruthy()
    expect(getByText(root, 'Processed in browser')).toBeTruthy()
    expect(getByText(root, 'Launcher ZIP')).toBeTruthy()
    expect(getByLabelText(root, 'Build a Server ZIP instead')).toBeTruthy()
    expect(getByRole(root, 'button', { name: /Convert file to ZIP/i })).toBeTruthy()
    expect(sourcePanel(root, 'upload').hidden).toBe(false)
    expect(sourcePanel(root, 'project').hidden).toBe(true)
    expect(sourcePanel(root, 'url').hidden).toBe(true)
    expect(getByText(root, 'Why are some mods missing from the ZIP?')).toBeTruthy()
    expect(getByText(root, /not affiliated with Modrinth/i)).toBeTruthy()
    expect(getByRole(root, 'navigation', { name: 'Footer navigation' })).toBeTruthy()
    expect(getByRole(root, 'link', { name: 'About' }).getAttribute('href')).toBe('/about/')
    expect(getByRole(root, 'link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy/')
    expect(getByText(root, /maintained by/i)).toBeTruthy()
  })

  it('renders launcher guidance and expanded FAQ topics', () => {
    const root = document.createElement('div')
    document.body.append(root)

    renderApp(root)

    expect(getByRole(root, 'heading', { level: 2, name: 'Which launchers need ZIP?' })).toBeTruthy()
    expect(getByText(root, 'Native .mrpack support')).toBeTruthy()
    expect(getByText(root, 'Prism Launcher')).toBeTruthy()
    expect(getByText(root, 'Official Minecraft Launcher')).toBeTruthy()
    expect(getByRole(root, 'heading', { level: 2, name: 'MRPACK conversion guides' })).toBeTruthy()
    expect(
      getByRole(root, 'link', { name: 'MRPACK conversion troubleshooting' }).getAttribute('href'),
    ).toBe('/blog/mrpack-conversion-errors/')
    expect(getByText(root, 'Why is an MRPACK file not the same as a normal ZIP?')).toBeTruthy()
    expect(getByText(root, 'What does hash checked mean?')).toBeTruthy()
  })

  it('renders visible step-by-step instructions for first-time users', () => {
    const root = document.createElement('div')
    document.body.append(root)

    renderApp(root)

    expect(getByRole(root, 'heading', { level: 2, name: 'How to use this converter' })).toBeTruthy()
    expect(getByText(root, 'Choose your source')).toBeTruthy()
    expect(getByText(root, 'Keep Launcher ZIP selected')).toBeTruthy()
    expect(getByText(root, 'Click Convert')).toBeTruthy()
    expect(getByText(root, 'Download the result')).toBeTruthy()
    expect(getByText(root, 'Review missing files if needed')).toBeTruthy()
    expect(getByText(root, /If files are missing, copy or download the missing file report/i)).toBeTruthy()
  })

  it('binds behavior to pre-rendered markup without replacing the static HTML', () => {
    const root = document.createElement('div')
    document.body.append(root)

    root.innerHTML = `
      <main data-static-marker="from-build">
        <form id="converter-form">
          <label><input type="radio" name="source" value="project">Project ID</label>
          <label><input type="radio" name="source" value="url">From URL</label>
          <label><input type="radio" name="source" value="upload" checked>Upload File</label>
          <section data-source-panel="project" hidden>
            <label for="project-id">Modrinth project ID, slug, or URL</label>
            <input id="project-id" type="text">
          </section>
          <section data-source-panel="url" hidden>
            <label for="mrpack-url">Direct .mrpack download URL</label>
            <input id="mrpack-url" type="url">
          </section>
          <section data-source-panel="upload">
            <label for="mrpack-file">Local .mrpack file</label>
            <input id="mrpack-file" type="file">
            <small id="file-name">No file selected</small>
          </section>
          <input type="checkbox" name="target" value="server" aria-label="Build a Server ZIP instead">
          <button id="convert-button" type="submit">Convert file to ZIP</button>
          <section id="status-panel" data-state="idle" aria-busy="false">
            <h2 id="status-title">Ready</h2>
            <p id="status-body">Ready.</p>
            <progress id="progress" hidden></progress>
            <ul id="warning-list"></ul>
            <ul id="missing-list"></ul>
            <div id="result-actions" hidden>
              <button id="download-zip" type="button">Download ZIP</button>
              <button id="copy-missing" type="button">Copy missing file list</button>
              <button id="download-report" type="button">Download report .txt</button>
            </div>
            <section id="outcome-feedback" aria-labelledby="outcome-question" hidden>
              <span id="outcome-target"></span>
              <h3 id="outcome-question">Did this ZIP complete your task?</h3>
              <p id="outcome-hint">Test first.</p>
              <div id="outcome-actions">
                <button id="outcome-yes" type="button">Yes</button>
                <button id="outcome-no" type="button" aria-expanded="false" aria-controls="outcome-reasons">No</button>
                <button id="outcome-deferred" type="button">I haven't tested it yet</button>
              </div>
              <fieldset id="outcome-reasons" hidden>
                <legend>What stopped you?</legend>
                <div id="outcome-reason-options"></div>
                <button id="outcome-reason-submit" type="button" disabled>Send feedback</button>
              </fieldset>
              <p id="outcome-thanks" hidden></p>
              <p id="outcome-help" hidden><a href="mailto:wuguang425@gmail.com?subject=MRPACK%20to%20ZIP%20help">wuguang425@gmail.com</a></p>
            </section>
          </section>
        </form>
      </main>
    `

    renderApp(root)

    expect(root.querySelector('[data-static-marker="from-build"]')).toBeTruthy()
    expect(getByRole(root, 'button', { name: /Convert file to ZIP/i })).toBeTruthy()
    expect(sourcePanel(root, 'upload').hidden).toBe(false)
  })

  it('submits only the active source and defaults to launcher target', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () => result())
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })

    fireEvent.input(getByLabelText(root, 'Modrinth project ID, slug, or URL'), {
      target: { value: 'https://modrinth.com/modpack/fabulously-optimized' },
    })
    fireEvent.input(getByLabelText(root, 'Paste .mrpack download URL'), {
      target: { value: 'https://cdn.example/hidden.mrpack' },
    })

    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    const file = new File(['fixture'], 'fixture.mrpack', { type: 'application/octet-stream' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))

    await waitFor(() => expect(convertMrpack).toHaveBeenCalled())
    await waitFor(() => expect(getByText(root, 'Partial ZIP ready')).toBeTruthy())

    expect(convertMrpack).toHaveBeenCalledWith(
      { kind: 'archive', data: file, sourceName: 'fixture.mrpack' },
      expect.objectContaining({ target: 'client' }),
    )
    expect(trackEvent).toHaveBeenCalledWith('upload_submitted', {
      input_type: 'upload',
      target: 'client',
    })
  })

  it('shows warnings and actionable missing file guidance after partial conversion', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () =>
      result({
        warnings: ['No release version with a .mrpack file was found; using the latest available version instead.'],
      }),
    )

    renderApp(root, { convertMrpack })

    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    const file = new File(['fixture'], 'fixture.mrpack', { type: 'application/octet-stream' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))

    await waitFor(() => expect(getByText(root, 'Partial ZIP ready')).toBeTruthy())

    expect(getByText(root, 'Warning')).toBeTruthy()
    expect(getByText(root, /using the latest available version instead/i)).toBeTruthy()
    expect(getByText(root, /download this mod manually/i)).toBeTruthy()
    expect(getByText(root, /Launcher ZIP package/i)).toBeTruthy()
    expect(getByText(root, /download the partial ZIP or copy the report/i)).toBeTruthy()
  })

  it('tracks each distinct partial reason once without exposing file paths', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () =>
      result({
        filesTotal: 3,
        filesDownloaded: 0,
        filesFailed: 3,
        missingFiles: [
          {
            path: 'mods/private-one.jar',
            reason: 'download_failed',
            message: 'Download failed.',
          },
          {
            path: 'mods/private-two.jar',
            reason: 'hash_mismatch',
            message: 'Hash mismatch.',
          },
          {
            path: 'mods/private-three.jar',
            reason: 'download_failed',
            message: 'Download failed.',
          },
        ],
      }),
    )
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })
    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['fixture'], 'private-pack.mrpack')] },
    })
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))

    await waitFor(() => expect(getByText(root, 'Partial ZIP ready')).toBeTruthy())

    const reasonEvents = trackEvent.mock.calls.filter(([name]) => name === 'convert_partial_reason')
    expect(reasonEvents.map(([, params]) => params.failure_reason)).toEqual([
      'download_failed',
      'hash_mismatch',
    ])
    expect(JSON.stringify(reasonEvents)).not.toContain('private-')
  })

  it('uses typed fatal error codes and does not expose unknown error details', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi
      .fn()
      .mockRejectedValueOnce(
        new ConversionError('manifest_invalid', 'modrinth.index.json is not valid JSON.'),
      )
      .mockRejectedValueOnce(new Error('secret URL https://private.example/pack.mrpack'))
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })
    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [new File(['fixture'], 'fixture.mrpack')] } })
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))

    await waitFor(() => expect(getByText(root, 'modrinth.index.json is not valid JSON.')).toBeTruthy())
    expect(trackEvent).toHaveBeenCalledWith('convert_failed', {
      input_type: 'upload',
      target: 'client',
      status: 'failed',
      failure_reason: 'manifest_invalid',
      file_count_bucket: '0',
    })

    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))
    await waitFor(() =>
      expect(
        getByText(root, 'Conversion failed unexpectedly. Try again or check the troubleshooting guide.'),
      ).toBeTruthy(),
    )
    expect(trackEvent).toHaveBeenCalledWith('convert_failed', {
      input_type: 'upload',
      target: 'client',
      status: 'failed',
      failure_reason: 'unknown',
      file_count_bucket: '0',
    })
    expect(root.textContent).not.toContain('private.example')
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain('private.example')
  })

  it('shows one launcher checkpoint after download and allows a deferred answer to become Yes', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () =>
      result({ status: 'success', missingFiles: [], filesDownloaded: 2, filesFailed: 0 }),
    )
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })
    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [new File(['fixture'], 'fixture.mrpack')] } })
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))
    await waitFor(() => expect(getByText(root, 'ZIP ready')).toBeTruthy())

    const download = getByRole(root, 'button', { name: 'Download ZIP' })
    fireEvent.click(download)
    fireEvent.click(download)

    expect(
      getByRole(root, 'heading', {
        level: 3,
        name: 'Were you able to import or install this ZIP and launch the pack?',
      }),
    ).toBeTruthy()
    expect(trackEvent.mock.calls.filter(([name]) => name === 'zip_feedback_shown')).toHaveLength(1)

    fireEvent.click(getByRole(root, 'button', { name: "I haven't tested it yet" }))
    expect(trackEvent.mock.calls.filter(([name]) => name === 'zip_outcome_deferred')).toHaveLength(1)
    fireEvent.click(getByRole(root, 'button', { name: 'Yes' }))

    expect(trackEvent).toHaveBeenCalledWith('zip_outcome_yes', {
      input_type: 'upload',
      target: 'client',
      status: 'success',
      failure_reason: 'none',
      file_count_bucket: '1-10',
    })
    expect(getByText(root, 'Thanks. That confirms the ZIP supported your next step.')).toBeTruthy()
    expect(root.querySelector<HTMLElement>('#outcome-help')?.hidden).toBe(true)
  })

  it('collects an enumerated Server ZIP No reason and exposes only the approved help email', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () => result({ target: 'server' }))
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })
    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [new File(['fixture'], 'fixture.mrpack')] } })
    fireEvent.click(getByLabelText(root, 'Build a Server ZIP instead'))
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))
    await waitFor(() => expect(getByText(root, 'Partial ZIP ready')).toBeTruthy())
    fireEvent.click(getByRole(root, 'button', { name: 'Download ZIP' }))

    expect(
      getByRole(root, 'heading', {
        level: 3,
        name: 'Were you still able to set up and start the server with this partial ZIP?',
      }),
    ).toBeTruthy()
    fireEvent.click(getByRole(root, 'button', { name: 'No' }))
    fireEvent.click(getByLabelText(root, 'Required server files were missing'))
    fireEvent.click(getByRole(root, 'button', { name: 'Send feedback' }))

    expect(trackEvent).toHaveBeenCalledWith('zip_outcome_no', {
      input_type: 'upload',
      target: 'server',
      status: 'partial',
      failure_reason: 'download_failed',
      file_count_bucket: '1-10',
      outcome_reason: 'required_files_missing',
    })
    const help = root.querySelector<HTMLElement>('#outcome-help')
    expect(help?.hidden).toBe(false)
    expect(
      getByRole(help as HTMLElement, 'link', { name: 'wuguang425@gmail.com' }).getAttribute('href'),
    ).toBe('mailto:wuguang425@gmail.com?subject=MRPACK%20to%20ZIP%20help')
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain('fixture.mrpack')
  })

  it('resets the checkpoint when a new conversion starts', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () =>
      result({ status: 'success', missingFiles: [], filesDownloaded: 2, filesFailed: 0 }),
    )

    renderApp(root, { convertMrpack })
    const fileInput = getByLabelText(root, 'Upload .mrpack file') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [new File(['fixture'], 'fixture.mrpack')] } })
    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))
    await waitFor(() => expect(getByText(root, 'ZIP ready')).toBeTruthy())
    fireEvent.click(getByRole(root, 'button', { name: 'Download ZIP' }))
    expect(root.querySelector<HTMLElement>('#outcome-feedback')?.hidden).toBe(false)

    fireEvent.click(getByRole(root, 'button', { name: /Convert file to ZIP/i }))
    expect(root.querySelector<HTMLElement>('#outcome-feedback')?.hidden).toBe(true)
    await waitFor(() => expect(convertMrpack).toHaveBeenCalledTimes(2))
  })

  it('switches source panels and submits project input without leaking hidden values', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () => result())
    const trackEvent = vi.fn()

    renderApp(root, { convertMrpack, trackEvent })

    fireEvent.input(getByLabelText(root, 'Paste .mrpack download URL'), {
      target: { value: 'https://cdn.example/hidden.mrpack' },
    })
    fireEvent.click(getByRole(root, 'radio', { name: 'Project ID' }))
    fireEvent.input(getByLabelText(root, 'Modrinth project ID, slug, or URL'), {
      target: { value: 'https://modrinth.com/modpack/fabulously-optimized' },
    })
    fireEvent.click(getByRole(root, 'button', { name: /Find and convert pack/i }))

    await waitFor(() => expect(convertMrpack).toHaveBeenCalled())

    expect(sourcePanel(root, 'project').hidden).toBe(false)
    expect(sourcePanel(root, 'url').hidden).toBe(true)
    expect(sourcePanel(root, 'upload').hidden).toBe(true)
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

  it('submits URL input and maps advanced Server ZIP to server target', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const convertMrpack = vi.fn(async () => result({ target: 'server' }))

    renderApp(root, { convertMrpack })

    fireEvent.click(getByRole(root, 'radio', { name: 'From URL' }))
    fireEvent.input(getByLabelText(root, 'Paste .mrpack download URL'), {
      target: { value: 'https://cdn.example/pack.mrpack' },
    })
    fireEvent.click(getByLabelText(root, 'Build a Server ZIP instead'))
    fireEvent.click(getByRole(root, 'button', { name: /Convert URL to ZIP/i }))

    await waitFor(() => expect(convertMrpack).toHaveBeenCalled())

    expect(convertMrpack).toHaveBeenCalledWith(
      { kind: 'url', url: 'https://cdn.example/pack.mrpack' },
      expect.objectContaining({ target: 'server' }),
    )
    expect(getByText(root, /Server ZIP package/i)).toBeTruthy()
  })

  it('shows an active waiting state while a URL conversion is still running', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    let finishConversion: ((value: ConversionResult) => void) | undefined
    const convertMrpack = vi.fn(
      () =>
        new Promise<ConversionResult>((resolve) => {
          finishConversion = resolve
        }),
    )

    renderApp(root, { convertMrpack })

    fireEvent.click(getByRole(root, 'radio', { name: 'From URL' }))
    fireEvent.input(getByLabelText(root, 'Paste .mrpack download URL'), {
      target: { value: 'https://cdn.example/pack.mrpack' },
    })
    fireEvent.click(getByRole(root, 'button', { name: /Convert URL to ZIP/i }))

    await waitFor(() => expect(convertMrpack).toHaveBeenCalled())

    const convertButton = getByRole(root, 'button', { name: /Converting URL/i }) as HTMLButtonElement
    const statusPanel = root.querySelector<HTMLElement>('#status-panel')
    const progress = root.querySelector<HTMLProgressElement>('#progress')

    expect(convertButton.disabled).toBe(true)
    expect(statusPanel?.dataset.state).toBe('busy')
    expect(statusPanel?.getAttribute('aria-busy')).toBe('true')
    expect(getByText(root, 'Fetching the .mrpack file from the URL.')).toBeTruthy()
    expect(progress?.hidden).toBe(false)
    expect(progress?.hasAttribute('value')).toBe(false)

    finishConversion?.(result({ status: 'success', missingFiles: [], filesDownloaded: 2, filesFailed: 0 }))

    await waitFor(() => expect(getByText(root, 'ZIP ready')).toBeTruthy())
    expect(convertButton.disabled).toBe(false)
    expect(statusPanel?.getAttribute('aria-busy')).toBe('false')
  })
})
