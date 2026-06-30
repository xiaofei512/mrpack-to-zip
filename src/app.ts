import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileArchive,
  Link,
  LoaderCircle,
  Monitor,
  Server,
  Settings2,
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
import { appMarkup } from './app-markup'

type AnalyticsParams = Record<string, string | number>
type TrackEvent = (name: string, params: AnalyticsParams) => void
type SourceMode = 'project' | 'url' | 'upload'

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

  if (!root.querySelector('#converter-form')) {
    root.innerHTML = appMarkup()
  }
  createIcons({
    root,
    icons: {
      AlertTriangle,
      CheckCircle2,
      ClipboardCopy,
      Download,
      FileArchive,
      Link,
      LoaderCircle,
      Monitor,
      Server,
      Settings2,
      Upload,
    },
  })

  const form = query<HTMLFormElement>(root, '#converter-form')
  const sourceInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="source"]')]
  const sourcePanels = [...root.querySelectorAll<HTMLElement>('[data-source-panel]')]
  const fileInput = query<HTMLInputElement>(root, '#mrpack-file')
  const urlInput = query<HTMLInputElement>(root, '#mrpack-url')
  const projectInput = query<HTMLInputElement>(root, '#project-id')
  const fileName = query<HTMLElement>(root, '#file-name')
  const convertButton = query<HTMLButtonElement>(root, '#convert-button')
  const statusPanel = query<HTMLElement>(root, '#status-panel')
  const statusTitle = query<HTMLElement>(root, '#status-title')
  const statusBody = query<HTMLElement>(root, '#status-body')
  const progress = query<HTMLProgressElement>(root, '#progress')
  const resultActions = query<HTMLElement>(root, '#result-actions')
  const missingList = query<HTMLElement>(root, '#missing-list')
  const warningList = query<HTMLElement>(root, '#warning-list')
  const downloadButton = query<HTMLButtonElement>(root, '#download-zip')
  const copyButton = query<HTMLButtonElement>(root, '#copy-missing')
  const reportButton = query<HTMLButtonElement>(root, '#download-report')

  let latestResult: ConversionResult | null = null
  let latestInputType: string = 'upload'
  let isConverting = false

  const syncSourceMode = () => {
    const mode = selectedSource(root)

    for (const panel of sourcePanels) {
      panel.hidden = panel.dataset.sourcePanel !== mode
    }

    if (!isConverting) {
      renderConvertButton(convertButton, mode, false)
    }
  }

  for (const input of sourceInputs) {
    input.addEventListener('change', syncSourceMode)
  }
  syncSourceMode()

  fileInput.addEventListener('change', () => {
    fileName.textContent = fileInput.files?.[0]?.name ?? 'No file selected'
    trackEvent('file_selected', { input_type: 'upload', target: selectedTarget(root) })
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const target = selectedTarget(root)
    const input = selectedInput(selectedSource(root), fileInput, urlInput, projectInput)
    latestInputType = input.type

    if (!input.value) {
      showStatus(statusPanel, statusTitle, statusBody, 'Choose an input first', input.message, 'error')
      return
    }

    latestResult = null
    resultActions.hidden = true
    missingList.innerHTML = ''
    warningList.innerHTML = ''
    isConverting = true
    setFormBusy(form, true)
    renderConvertButton(convertButton, input.type, true)
    showStatus(statusPanel, statusTitle, statusBody, 'Converting pack', initialBusyMessage(input.type), 'busy')
    showPendingProgress(progress)

    trackEvent(`${input.type}_submitted`, { input_type: input.type, target })
    trackEvent('convert_started', { input_type: input.type, target })

    try {
      const result = await convertMrpack(input.value, {
        target,
        onProgress: (state) => {
          showMeasuredProgress(progress, state.current, state.total)
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
    } finally {
      isConverting = false
      setFormBusy(form, false)
      renderConvertButton(convertButton, selectedSource(root), false)
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

function renderConvertButton(button: HTMLButtonElement, mode: SourceMode, isBusy: boolean) {
  const icon = isBusy ? 'loader-circle' : 'download'
  const text = isBusy ? busyButtonText(mode) : convertButtonText(mode)

  button.innerHTML = `<span data-lucide="${icon}" aria-hidden="true"></span>${text}`
  button.setAttribute('aria-busy', isBusy ? 'true' : 'false')
  createIcons({ root: button, icons: { Download, LoaderCircle } })
}

function busyButtonText(mode: SourceMode) {
  if (mode === 'project') {
    return 'Finding pack'
  }
  if (mode === 'url') {
    return 'Converting URL'
  }
  return 'Converting file'
}

function setFormBusy(form: HTMLFormElement, isBusy: boolean) {
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    'input, #convert-button',
  )) {
    control.disabled = isBusy
  }
}

function initialBusyMessage(inputType: 'upload' | 'url' | 'project') {
  if (inputType === 'project') {
    return 'Finding the latest Modrinth .mrpack release.'
  }
  if (inputType === 'url') {
    return 'Fetching the .mrpack file from the URL.'
  }
  return 'Reading the local .mrpack file.'
}

function showPendingProgress(progress: HTMLProgressElement) {
  progress.hidden = false
  progress.max = 1
  progress.removeAttribute('value')
}

function showMeasuredProgress(progress: HTMLProgressElement, current: number, total: number) {
  progress.hidden = false
  progress.max = Math.max(total, 1)
  progress.value = total === 0 ? 1 : current
}

function selectedSource(root: HTMLElement): SourceMode {
  const selected = query<HTMLInputElement>(root, 'input[name="source"]:checked')

  if (selected.value === 'project' || selected.value === 'url') {
    return selected.value
  }

  return 'upload'
}

function convertButtonText(mode: SourceMode) {
  if (mode === 'project') {
    return 'Find and convert pack'
  }
  if (mode === 'url') {
    return 'Convert URL to ZIP'
  }
  return 'Convert file to ZIP'
}

function selectedInput(
  sourceMode: SourceMode,
  fileInput: HTMLInputElement,
  urlInput: HTMLInputElement,
  projectInput: HTMLInputElement,
): { type: 'upload' | 'url' | 'project'; value: MrpackInput | null; message: string } {
  if (sourceMode === 'upload') {
    const file = fileInput.files?.[0]

    return {
      type: 'upload',
      value: file ? { kind: 'archive', data: file, sourceName: file.name } : null,
      message: 'Choose a local .mrpack file.',
    }
  }

  if (sourceMode === 'url') {
    const url = urlInput.value.trim()

    return {
      type: 'url',
      value: url ? { kind: 'url', url } : null,
      message: 'Paste a direct .mrpack download URL.',
    }
  }

  const project = projectInput.value.trim()

  return {
    type: 'project',
    value: project ? { kind: 'project', projectIdOrSlugOrUrl: project } : null,
    message: 'Enter a Modrinth project ID, slug, or URL.',
  }
}

function selectedTarget(root: HTMLElement): ConversionTarget {
  const selected = root.querySelector<HTMLInputElement>('input[name="target"]:checked')
  return selected?.value === 'server' ? 'server' : 'client'
}

function renderResult(root: HTMLElement, result: ConversionResult) {
  const statusPanel = query<HTMLElement>(root, '#status-panel')
  const statusTitle = query<HTMLElement>(root, '#status-title')
  const statusBody = query<HTMLElement>(root, '#status-body')
  const progress = query<HTMLProgressElement>(root, '#progress')
  const missingList = query<HTMLElement>(root, '#missing-list')
  const warningList = query<HTMLElement>(root, '#warning-list')
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
    resultStatusMessage(result),
    state,
  )

  warningList.innerHTML = result.warnings
    .map((warning) => `<li><strong>Warning</strong><span>${escapeHtml(warning)}</span></li>`)
    .join('')

  missingList.innerHTML = result.missingFiles
    .map(
      (file) => `
        <li>
          <strong>${escapeHtml(file.path)}</strong>
          <span>${escapeHtml(file.reason)}</span>
          <p>${escapeHtml(file.message)} ${escapeHtml(missingFileHint(file.reason))}</p>
        </li>
      `,
    )
    .join('')
}

function resultStatusMessage(result: ConversionResult) {
  const packageLabel = result.target === 'server' ? 'Server ZIP' : 'Launcher ZIP'
  const base = `${result.filesDownloaded}/${result.filesTotal} manifest files downloaded for the ${packageLabel} package.`

  if (result.status === 'partial') {
    return `${base} Review the missing file list, then download the partial ZIP or copy the report.`
  }

  if (result.status === 'failed') {
    return `${base} No complete ZIP could be created.`
  }

  return base
}

function missingFileHint(reason: string) {
  if (reason === 'hash_mismatch') {
    return 'Verify the source before using this file.'
  }
  if (reason === 'invalid_response') {
    return 'Try again later or download it manually from the pack page.'
  }
  if (reason === 'unsafe_path') {
    return 'The path was skipped because it is not safe to write into a ZIP.'
  }
  return 'Try the pack page or download this mod manually.'
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
  panel.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false')
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
