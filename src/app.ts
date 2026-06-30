import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileArchive,
  Link,
  Monitor,
  Server,
  Upload,
  createIcons,
} from 'lucide'
import {
  convertMrpack as defaultConvertMrpack,
  createMissingFilesReport,
  type ConversionResult,
  type ConversionTarget,
  type MrpackInput,
} from './lib/mrpack'

type AnalyticsParams = Record<string, string | number>
type TrackEvent = (name: string, params: AnalyticsParams) => void

export interface AppDependencies {
  convertMrpack?: typeof defaultConvertMrpack
  trackEvent?: TrackEvent
}

declare global {
  interface Window {
    gtag?: (command: 'event', name: string, params: AnalyticsParams) => void
  }
}

export function renderApp(root: HTMLElement, dependencies: AppDependencies = {}) {
  const convertMrpack = dependencies.convertMrpack ?? defaultConvertMrpack
  const trackEvent = dependencies.trackEvent ?? defaultTrackEvent

  root.innerHTML = appTemplate()
  createIcons({
    root,
    icons: {
      AlertTriangle,
      CheckCircle2,
      ClipboardCopy,
      Download,
      FileArchive,
      Link,
      Monitor,
      Server,
      Upload,
    },
  })

  const form = query<HTMLFormElement>(root, '#converter-form')
  const fileInput = query<HTMLInputElement>(root, '#mrpack-file')
  const urlInput = query<HTMLInputElement>(root, '#mrpack-url')
  const projectInput = query<HTMLInputElement>(root, '#project-id')
  const fileName = query<HTMLElement>(root, '#file-name')
  const statusPanel = query<HTMLElement>(root, '#status-panel')
  const statusTitle = query<HTMLElement>(root, '#status-title')
  const statusBody = query<HTMLElement>(root, '#status-body')
  const progress = query<HTMLProgressElement>(root, '#progress')
  const resultActions = query<HTMLElement>(root, '#result-actions')
  const missingList = query<HTMLElement>(root, '#missing-list')
  const downloadButton = query<HTMLButtonElement>(root, '#download-zip')
  const copyButton = query<HTMLButtonElement>(root, '#copy-missing')
  const reportButton = query<HTMLButtonElement>(root, '#download-report')

  let latestResult: ConversionResult | null = null
  let latestInputType: string = 'upload'

  fileInput.addEventListener('change', () => {
    fileName.textContent = fileInput.files?.[0]?.name ?? 'No file selected'
    trackEvent('file_selected', { input_type: 'upload', target: selectedTarget(root) })
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const target = selectedTarget(root)
    const input = selectedInput(fileInput, urlInput, projectInput)
    latestInputType = input.type

    if (!input.value) {
      showStatus(statusPanel, statusTitle, statusBody, 'Choose an input first', input.message, 'error')
      return
    }

    latestResult = null
    resultActions.hidden = true
    missingList.innerHTML = ''
    showStatus(statusPanel, statusTitle, statusBody, 'Converting pack', 'Reading the manifest.', 'busy')
    progress.hidden = false
    progress.value = 0
    progress.max = 1

    trackEvent(`${input.type}_submitted`, { input_type: input.type, target })
    trackEvent('convert_started', { input_type: input.type, target })

    try {
      const result = await convertMrpack(input.value, {
        target,
        onProgress: (state) => {
          progress.max = Math.max(state.total, 1)
          progress.value = state.current
          statusBody.textContent = state.label
        },
      })

      latestResult = result
      renderResult(root, result)
      trackEvent(`convert_${result.status}`, {
        input_type: input.type,
        target,
        status: result.status,
        failure_reason: firstFailureReason(result),
        file_count_bucket: fileCountBucket(result.filesTotal),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversion failed.'
      progress.hidden = true
      showStatus(statusPanel, statusTitle, statusBody, 'Conversion failed', message, 'error')
      trackEvent('convert_failed', {
        input_type: input.type,
        target,
        status: 'failed',
        failure_reason: 'conversion_error',
        file_count_bucket: '0',
      })
    }
  })

  downloadButton.addEventListener('click', () => {
    if (!latestResult) {
      return
    }

    downloadBlob(latestResult.zipBlob, outputFileName(latestResult))
    trackEvent('zip_downloaded', {
      input_type: latestInputType,
      target: latestResult.target,
      status: latestResult.status,
      failure_reason: firstFailureReason(latestResult),
      file_count_bucket: fileCountBucket(latestResult.filesTotal),
    })
  })

  copyButton.addEventListener('click', async () => {
    if (!latestResult) {
      return
    }

    const report = createMissingFilesReport(latestResult)
    await navigator.clipboard?.writeText(report)
    copyButton.textContent = 'Copied'
    trackEvent('missing_files_copied', {
      input_type: latestInputType,
      target: latestResult.target,
      status: latestResult.status,
      failure_reason: firstFailureReason(latestResult),
      file_count_bucket: fileCountBucket(latestResult.filesTotal),
    })
  })

  reportButton.addEventListener('click', () => {
    if (!latestResult) {
      return
    }

    downloadBlob(
      new Blob([createMissingFilesReport(latestResult)], { type: 'text/plain;charset=utf-8' }),
      'mrpack-to-zip-report.txt',
    )
    trackEvent('report_downloaded', {
      input_type: latestInputType,
      target: latestResult.target,
      status: latestResult.status,
      failure_reason: firstFailureReason(latestResult),
      file_count_bucket: fileCountBucket(latestResult.filesTotal),
    })
  })
}

function appTemplate() {
  return `
    <main class="shell">
      <section class="hero-panel" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">Client-side Modrinth pack utility</p>
          <h1 id="page-title">MRPACK to ZIP Converter</h1>
          <p class="lede">Convert Modrinth .mrpack files into regular ZIP packages in your browser. Upload a file, paste a direct .mrpack URL, or use a Modrinth project ID.</p>
          <div class="trust-strip" aria-label="Tool boundaries">
            <span>No account</span>
            <span>No file upload</span>
            <span>No mod hosting</span>
          </div>
        </div>

        <form id="converter-form" class="tool-panel">
          <div class="mode-grid" aria-label="Output target">
            <label class="mode-card">
              <input type="radio" name="target" value="client" aria-label="Client ZIP" checked>
              <span data-lucide="monitor" aria-hidden="true"></span>
              <strong>Client ZIP</strong>
              <small>Includes client files and client-overrides.</small>
            </label>
            <label class="mode-card">
              <input type="radio" name="target" value="server" aria-label="Server ZIP">
              <span data-lucide="server" aria-hidden="true"></span>
              <strong>Server ZIP</strong>
              <small>Includes server files and server-overrides.</small>
            </label>
          </div>

          <div class="input-stack">
            <label class="field-block" for="mrpack-file">
              <span class="field-label"><i data-lucide="upload" aria-hidden="true"></i>Upload .mrpack file</span>
              <span class="file-picker">
                <input id="mrpack-file" class="file-input-native" type="file" accept=".mrpack" aria-label="Upload .mrpack file">
                <span class="file-picker-button">Choose .mrpack</span>
              </span>
              <small id="file-name">No file selected</small>
            </label>
            <label class="field-block" for="mrpack-url">
              <span class="field-label"><i data-lucide="link" aria-hidden="true"></i>Paste .mrpack download URL</span>
              <input id="mrpack-url" type="url" inputmode="url" aria-label="Paste .mrpack download URL" placeholder="https://cdn.modrinth.com/.../pack.mrpack">
            </label>
            <label class="field-block" for="project-id">
              <span class="field-label"><i data-lucide="file-archive" aria-hidden="true"></i>Modrinth project ID, slug, or URL</span>
              <input id="project-id" type="text" autocomplete="off" aria-label="Modrinth project ID, slug, or URL" placeholder="fabulously-optimized or https://modrinth.com/modpack/...">
            </label>
          </div>

          <button class="primary-action" type="submit"><span data-lucide="download" aria-hidden="true"></span>Convert to ZIP</button>

          <section id="status-panel" class="status-panel" data-state="idle" aria-live="polite">
            <h2 id="status-title">Ready</h2>
            <p id="status-body">Local files stay in your browser. Remote URLs are fetched directly by your browser.</p>
            <progress id="progress" value="0" max="1" hidden></progress>
            <ul id="missing-list" class="missing-list"></ul>
            <div id="result-actions" class="result-actions" hidden>
              <button id="download-zip" type="button"><span data-lucide="download" aria-hidden="true"></span>Download ZIP</button>
              <button id="copy-missing" type="button"><span data-lucide="clipboard-copy" aria-hidden="true"></span>Copy missing file list</button>
              <button id="download-report" type="button"><span data-lucide="file-archive" aria-hidden="true"></span>Download report .txt</button>
            </div>
          </section>
        </form>
      </section>

      <section class="content-band" aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <div class="process-grid">
          <article><strong>Read manifest</strong><p>The tool opens <code>modrinth.index.json</code> from your .mrpack file.</p></article>
          <article><strong>Place overrides</strong><p>Shared overrides and the selected client/server override folder are copied into the ZIP root.</p></article>
          <article><strong>Fetch files</strong><p>Manifest files are downloaded by your browser and checked against manifest hashes.</p></article>
          <article><strong>Report gaps</strong><p>CORS, network, and checksum failures are listed instead of being hidden.</p></article>
        </div>
      </section>

      <section class="content-band split-band">
        <div>
          <h2>Supported inputs</h2>
          <ul class="plain-list">
            <li>Local .mrpack files</li>
            <li>Direct .mrpack download URLs</li>
            <li>Modrinth project IDs, slugs, and project URLs</li>
          </ul>
        </div>
        <div>
          <h2>Common issues</h2>
          <ul class="plain-list">
            <li>Some third-party hosts block browser downloads with CORS.</li>
            <li>Large packs can take time and memory.</li>
            <li>A format ZIP is not a guarantee that a pack is server-compatible.</li>
          </ul>
        </div>
      </section>

      <section class="content-band faq-band" aria-labelledby="faq">
        <h2 id="faq">FAQ</h2>
        <details open><summary>What is an MRPACK file?</summary><p>An MRPACK file is a ZIP-based Modrinth modpack manifest with override folders and download instructions.</p></details>
        <details><summary>How do I convert MRPACK to ZIP?</summary><p>Choose a local file, paste a direct .mrpack URL, or enter a Modrinth project. Then choose Client ZIP or Server ZIP and convert.</p></details>
        <details><summary>Is my MRPACK file uploaded?</summary><p>No. Local files are processed inside your browser. Remote URL and project modes fetch remote files directly from your browser.</p></details>
        <details><summary>Why are some mods missing from the ZIP?</summary><p>Some files may be hosted outside Modrinth or blocked by CORS. Missing files are listed so you can handle them manually.</p></details>
        <details><summary>Is this an official Modrinth tool?</summary><p>No. This is an independent tool and is not affiliated with Modrinth, Mojang, Microsoft, Minecraft, or pack authors.</p></details>
      </section>
    </main>
  `
}

function selectedInput(
  fileInput: HTMLInputElement,
  urlInput: HTMLInputElement,
  projectInput: HTMLInputElement,
): { type: 'upload' | 'url' | 'project'; value: MrpackInput | null; message: string } {
  const file = fileInput.files?.[0]

  if (file) {
    return {
      type: 'upload',
      value: { kind: 'archive', data: file, sourceName: file.name },
      message: 'Choose a .mrpack file, paste a direct URL, or enter a Modrinth project.',
    }
  }

  if (urlInput.value.trim()) {
    return {
      type: 'url',
      value: { kind: 'url', url: urlInput.value.trim() },
      message: 'Paste a direct .mrpack download URL.',
    }
  }

  if (projectInput.value.trim()) {
    return {
      type: 'project',
      value: { kind: 'project', projectIdOrSlugOrUrl: projectInput.value.trim() },
      message: 'Enter a Modrinth project ID, slug, or URL.',
    }
  }

  return {
    type: 'upload',
    value: null,
    message: 'Choose a .mrpack file, paste a direct URL, or enter a Modrinth project.',
  }
}

function selectedTarget(root: HTMLElement): ConversionTarget {
  const selected = query<HTMLInputElement>(root, 'input[name="target"]:checked')
  return selected.value === 'server' ? 'server' : 'client'
}

function renderResult(root: HTMLElement, result: ConversionResult) {
  const statusPanel = query<HTMLElement>(root, '#status-panel')
  const statusTitle = query<HTMLElement>(root, '#status-title')
  const statusBody = query<HTMLElement>(root, '#status-body')
  const progress = query<HTMLProgressElement>(root, '#progress')
  const missingList = query<HTMLElement>(root, '#missing-list')
  const resultActions = query<HTMLElement>(root, '#result-actions')

  progress.hidden = true
  resultActions.hidden = false

  const title =
    result.status === 'success'
      ? 'ZIP ready'
      : result.status === 'partial'
        ? 'Partial ZIP ready'
        : 'Conversion failed'
  const state = result.status === 'success' ? 'success' : result.status === 'partial' ? 'warning' : 'error'

  showStatus(
    statusPanel,
    statusTitle,
    statusBody,
    title,
    `${result.filesDownloaded}/${result.filesTotal} manifest files downloaded for the ${result.target} package.`,
    state,
  )

  missingList.innerHTML = result.missingFiles
    .map((file) => `<li><strong>${escapeHtml(file.path)}</strong><span>${escapeHtml(file.reason)}</span></li>`)
    .join('')
}

function showStatus(
  panel: HTMLElement,
  title: HTMLElement,
  body: HTMLElement,
  heading: string,
  message: string,
  state: 'idle' | 'busy' | 'success' | 'warning' | 'error',
) {
  panel.dataset.state = state
  title.textContent = heading
  body.textContent = message
}

function defaultTrackEvent(name: string, params: AnalyticsParams) {
  window.gtag?.('event', name, params)
}

function firstFailureReason(result: ConversionResult) {
  return result.missingFiles[0]?.reason ?? 'none'
}

function fileCountBucket(count: number) {
  if (count === 0) {
    return '0'
  }
  if (count <= 10) {
    return '1-10'
  }
  if (count <= 50) {
    return '11-50'
  }
  if (count <= 150) {
    return '51-150'
  }
  return '151+'
}

function outputFileName(result: ConversionResult) {
  const safeName = `${result.packName}-${result.packVersion}-${result.target}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${safeName || 'mrpack-converted'}.zip`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }

  return element
}

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}
