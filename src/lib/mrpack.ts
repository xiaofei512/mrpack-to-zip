import JSZip from 'jszip'

export type ConversionTarget = 'client' | 'server'
export type ConversionStatus = 'success' | 'partial' | 'failed'
export type MissingReason =
  | 'download_failed'
  | 'hash_mismatch'
  | 'unsafe_path'
  | 'invalid_response'

export type FetchLike = (url: string) => Promise<Response>

export type MrpackInput =
  | { kind: 'archive'; data: ArrayBuffer | Uint8Array | Blob; sourceName?: string }
  | { kind: 'url'; url: string }
  | { kind: 'project'; projectIdOrSlugOrUrl: string }

export interface MissingFile {
  path: string
  reason: MissingReason
  message: string
}

export interface ConversionWarning {
  message: string
}

export interface ConversionResult {
  status: ConversionStatus
  packName: string
  packVersion: string
  target: ConversionTarget
  filesTotal: number
  filesDownloaded: number
  filesFailed: number
  zipBlob: Blob
  missingFiles: MissingFile[]
  warnings: string[]
}

export interface ConversionProgress {
  phase: 'loading' | 'copying' | 'downloading' | 'packing' | 'complete'
  current: number
  total: number
  label: string
}

export interface ConvertOptions {
  target: ConversionTarget
  fetcher?: FetchLike
  onProgress?: (progress: ConversionProgress) => void
}

export interface ProjectResolveResult {
  downloadUrl: string
  filename: string
  versionId: string
  versionNumber: string
  warnings: string[]
}

interface ManifestFile {
  path: string
  downloads?: string[]
  fileSize?: number
  hashes?: Record<string, string>
  env?: Partial<Record<ConversionTarget, string>>
}

interface ModrinthManifest {
  name?: string
  versionId?: string
  files?: ManifestFile[]
}

interface ModrinthVersionFile {
  url?: string
  filename?: string
}

interface ModrinthVersion {
  id?: string
  version_number?: string
  version_type?: string
  date_published?: string
  files?: ModrinthVersionFile[]
}

const MODRINTH_PROJECT_VERSION_API = 'https://api.modrinth.com/v2/project/'

export async function convertMrpack(
  input: MrpackInput,
  options: ConvertOptions,
): Promise<ConversionResult> {
  const fetcher = options.fetcher ?? fetch
  const warnings: string[] = []
  const archiveData = await loadArchiveInput(input, fetcher, warnings)
  options.onProgress?.({ phase: 'loading', current: 0, total: 1, label: 'Reading mrpack' })

  const sourceZip = await JSZip.loadAsync(archiveData)
  const manifestFile = sourceZip.file('modrinth.index.json')

  if (!manifestFile) {
    throw new Error('Missing modrinth.index.json.')
  }

  let manifest: ModrinthManifest
  try {
    manifest = JSON.parse(await manifestFile.async('string')) as ModrinthManifest
  } catch {
    throw new Error('modrinth.index.json is not valid JSON.')
  }

  const newZip = new JSZip()
  const targetFiles = (manifest.files ?? []).filter((file) => supportsTarget(file, options.target))
  const missingFiles: MissingFile[] = []
  let filesDownloaded = 0

  options.onProgress?.({
    phase: 'copying',
    current: 0,
    total: 1,
    label: 'Copying overrides',
  })
  await copyOverrides(sourceZip, newZip, options.target, warnings)

  for (const [index, file] of targetFiles.entries()) {
    options.onProgress?.({
      phase: 'downloading',
      current: index,
      total: targetFiles.length,
      label: file.path,
    })

    if (!isSafeZipPath(file.path)) {
      missingFiles.push({
        path: file.path,
        reason: 'unsafe_path',
        message: 'The manifest path is outside the ZIP root and was skipped.',
      })
      continue
    }

    const downloadResult = await downloadManifestFile(file, fetcher)

    if (!downloadResult.ok) {
      missingFiles.push({
        path: file.path,
        reason: downloadResult.reason,
        message: downloadResult.message,
      })
      continue
    }

    newZip.file(file.path, downloadResult.data)
    filesDownloaded += 1
  }

  options.onProgress?.({
    phase: 'packing',
    current: targetFiles.length,
    total: targetFiles.length,
    label: 'Creating ZIP',
  })
  const zipBlob = await newZip.generateAsync({ type: 'blob' })

  options.onProgress?.({
    phase: 'complete',
    current: targetFiles.length,
    total: targetFiles.length,
    label: 'Complete',
  })

  return {
    status: missingFiles.length > 0 ? 'partial' : 'success',
    packName: manifest.name ?? 'mrpack',
    packVersion: manifest.versionId ?? 'unknown',
    target: options.target,
    filesTotal: targetFiles.length,
    filesDownloaded,
    filesFailed: missingFiles.length,
    zipBlob,
    missingFiles,
    warnings,
  }
}

export async function resolveProjectMrpack(
  projectIdOrSlugOrUrl: string,
  options: { fetcher?: FetchLike } = {},
): Promise<ProjectResolveResult> {
  const projectIdOrSlug = parseProjectIdOrSlug(projectIdOrSlugOrUrl)
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(
    `${MODRINTH_PROJECT_VERSION_API}${encodeURIComponent(projectIdOrSlug)}/version`,
  )

  if (!response.ok) {
    throw new Error('Invalid Modrinth project ID, slug, or URL.')
  }

  const versions = (await response.json()) as ModrinthVersion[]
  const candidates = versions
    .map((version) => {
      const file = findMrpackFile(version)
      return file ? { version, file } : null
    })
    .filter((candidate): candidate is { version: ModrinthVersion; file: ModrinthVersionFile } =>
      Boolean(candidate),
    )

  if (candidates.length === 0) {
    throw new Error('No .mrpack file was found for this Modrinth project.')
  }

  const release = candidates
    .filter(({ version }) => version.version_type === 'release')
    .sort(compareVersionsByDateDesc)[0]

  const selected = release ?? candidates.sort(compareVersionsByDateDesc)[0]
  const warnings = release
    ? []
    : ['No release version with a .mrpack file was found; using the latest available version instead.']

  return {
    downloadUrl: selected.file.url ?? '',
    filename: selected.file.filename ?? 'download.mrpack',
    versionId: selected.version.id ?? selected.version.version_number ?? 'unknown',
    versionNumber: selected.version.version_number ?? 'unknown',
    warnings,
  }
}

export function parseProjectIdOrSlug(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('Enter a Modrinth project URL, slug, or project ID.')
  }

  try {
    const url = new URL(trimmed)

    if (url.hostname !== 'modrinth.com' && url.hostname !== 'www.modrinth.com') {
      throw new Error('Use a Modrinth project URL, slug, or project ID.')
    }

    const segments = url.pathname.split('/').filter(Boolean)
    const projectTypeIndex = segments.findIndex((segment) =>
      ['modpack', 'mod', 'resourcepack', 'shader'].includes(segment),
    )
    const projectSlug = segments[projectTypeIndex + 1]

    if (projectTypeIndex === -1 || !projectSlug) {
      throw new Error('Use a Modrinth project URL, slug, or project ID.')
    }

    return projectSlug
  } catch (error) {
    if (error instanceof TypeError) {
      if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(trimmed)) {
        return trimmed
      }

      throw new Error('Enter a valid Modrinth project ID or slug.')
    }

    throw error
  }
}

export function createMissingFilesReport(
  result: Omit<ConversionResult, 'zipBlob' | 'warnings'> & { warnings: string[] },
): string {
  const lines = [
    'MRPACK to ZIP conversion report',
    '',
    `Status: ${result.status}`,
    `Pack: ${result.packName}`,
    `Version: ${result.packVersion}`,
    `Target: ${result.target}`,
    `Files: ${result.filesDownloaded}/${result.filesTotal} downloaded`,
    '',
  ]

  if (result.missingFiles.length > 0) {
    lines.push('Missing files:')
    for (const file of result.missingFiles) {
      lines.push(`- ${file.path} - ${file.reason}: ${file.message}`)
    }
    lines.push('')
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:')
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`)
    }
  }

  return lines.join('\n').trimEnd()
}

async function loadArchiveInput(
  input: MrpackInput,
  fetcher: FetchLike,
  warnings: string[],
): Promise<ArrayBuffer> {
  if (input.kind === 'archive') {
    return toArrayBuffer(input.data)
  }

  if (input.kind === 'project') {
    const project = await resolveProjectMrpack(input.projectIdOrSlugOrUrl, { fetcher })
    warnings.push(...project.warnings)
    return fetchArrayBuffer(project.downloadUrl, fetcher, 'Could not download the selected .mrpack file.')
  }

  if (!input.url.includes('.mrpack')) {
    throw new Error('Enter a direct .mrpack download URL.')
  }

  return fetchArrayBuffer(input.url, fetcher, 'Could not download the .mrpack URL.')
}

async function fetchArrayBuffer(url: string, fetcher: FetchLike, errorMessage: string) {
  const response = await fetcher(url)

  if (!response.ok) {
    throw new Error(errorMessage)
  }

  return response.arrayBuffer()
}

async function toArrayBuffer(data: ArrayBuffer | Uint8Array | Blob): Promise<ArrayBuffer> {
  if (data instanceof Blob) {
    return data.arrayBuffer()
  }

  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    return copy.buffer
  }

  return data
}

async function copyOverrides(
  sourceZip: JSZip,
  newZip: JSZip,
  target: ConversionTarget,
  warnings: string[],
) {
  const targetPrefix = target === 'client' ? 'client-overrides/' : 'server-overrides/'
  const prefixes = ['overrides/', targetPrefix]

  for (const fileName of Object.keys(sourceZip.files)) {
    const file = sourceZip.files[fileName]

    if (file.dir) {
      continue
    }

    const prefix = prefixes.find((candidate) => fileName.startsWith(candidate))

    if (!prefix) {
      continue
    }

    const outputPath = fileName.slice(prefix.length)

    if (!isSafeZipPath(outputPath)) {
      warnings.push(`Skipped unsafe override path: ${fileName}`)
      continue
    }

    newZip.file(outputPath, await file.async('arraybuffer'))
  }
}

function supportsTarget(file: ManifestFile, target: ConversionTarget) {
  return file.env?.[target] !== 'unsupported'
}

type DownloadResult =
  | { ok: true; data: ArrayBuffer }
  | { ok: false; reason: MissingReason; message: string }

async function downloadManifestFile(file: ManifestFile, fetcher: FetchLike): Promise<DownloadResult> {
  const downloads = file.downloads ?? []
  let sawHashMismatch = false
  let sawInvalidResponse = false

  for (const url of downloads) {
    try {
      const response = await fetcher(url)

      if (!response.ok) {
        sawInvalidResponse = true
        continue
      }

      const data = await response.arrayBuffer()

      if (!(await matchesManifestHash(data, file.hashes))) {
        sawHashMismatch = true
        continue
      }

      return { ok: true, data }
    } catch {
      continue
    }
  }

  if (sawHashMismatch) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      message: 'The downloaded file did not match the manifest hash.',
    }
  }

  if (sawInvalidResponse) {
    return {
      ok: false,
      reason: 'invalid_response',
      message: 'The file URL returned an unsuccessful response.',
    }
  }

  return {
    ok: false,
    reason: 'download_failed',
    message: 'The file could not be downloaded by this browser.',
  }
}

async function matchesManifestHash(data: ArrayBuffer, hashes: Record<string, string> | undefined) {
  if (!hashes) {
    return true
  }

  const supportedHash = ['sha512', 'sha256', 'sha1'].find((key) => hashes[key])

  if (!supportedHash) {
    return true
  }

  return (await digestHex(data, supportedHash)) === hashes[supportedHash].toLowerCase()
}

async function digestHex(data: ArrayBuffer, hashName: string) {
  const algorithm = hashName.replace('sha', 'SHA-')
  const digest = await globalThis.crypto.subtle.digest(algorithm, data)

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isSafeZipPath(path: string) {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) {
    return false
  }

  if (path.includes('\\')) {
    return false
  }

  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function findMrpackFile(version: ModrinthVersion) {
  return version.files?.find((file) => {
    return file.filename?.toLowerCase().endsWith('.mrpack') || file.url?.includes('.mrpack')
  })
}

function compareVersionsByDateDesc(
  a: { version: ModrinthVersion },
  b: { version: ModrinthVersion },
) {
  return dateValue(b.version.date_published) - dateValue(a.version.date_published)
}

function dateValue(value: string | undefined) {
  return value ? new Date(value).getTime() : 0
}
