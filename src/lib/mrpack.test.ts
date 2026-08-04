import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import {
  ConversionError,
  convertMrpack,
  conversionErrorDetails,
  createMissingFilesReport,
  parseProjectIdOrSlug,
  resolveProjectMrpack,
} from './mrpack'

const textEncoder = new TextEncoder()

function bytes(value: string): Uint8Array {
  return textEncoder.encode(value)
}

function sha1(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex')
}

async function makeMrpack(manifest: unknown, extraFiles: Record<string, string> = {}) {
  const zip = new JSZip()
  zip.file('modrinth.index.json', JSON.stringify(manifest, null, 2))

  for (const [path, value] of Object.entries(extraFiles)) {
    zip.file(path, value)
  }

  return zip.generateAsync({ type: 'arraybuffer' })
}

function responseFor(data: Uint8Array) {
  return new Response(data)
}

describe('convertMrpack', () => {
  it('builds a client zip with overrides, client-overrides, and client-compatible manifest files', async () => {
    const clientJar = bytes('client jar')
    const serverJar = bytes('server jar')
    const sharedJar = bytes('shared jar')
    const mrpack = await makeMrpack(
      {
        formatVersion: 1,
        game: 'minecraft',
        name: 'Fixture Pack',
        versionId: '1.0.0',
        dependencies: { minecraft: '1.20.1' },
        files: [
          {
            path: 'mods/client.jar',
            downloads: ['https://cdn.example/client.jar'],
            fileSize: clientJar.byteLength,
            hashes: { sha1: sha1(clientJar) },
            env: { client: 'required', server: 'unsupported' },
          },
          {
            path: 'mods/server.jar',
            downloads: ['https://cdn.example/server.jar'],
            fileSize: serverJar.byteLength,
            hashes: { sha1: sha1(serverJar) },
            env: { client: 'unsupported', server: 'required' },
          },
          {
            path: 'mods/shared.jar',
            downloads: ['https://cdn.example/shared.jar'],
            fileSize: sharedJar.byteLength,
            hashes: { sha1: sha1(sharedJar) },
          },
        ],
      },
      {
        'overrides/options.txt': 'shared override',
        'client-overrides/config/client.toml': 'client override',
        'server-overrides/config/server.toml': 'server override',
      },
    )

    const fetcher = vi.fn(async (url: string) => {
      const table: Record<string, Uint8Array> = {
        'https://cdn.example/client.jar': clientJar,
        'https://cdn.example/server.jar': serverJar,
        'https://cdn.example/shared.jar': sharedJar,
      }
      return responseFor(table[url])
    })

    const result = await convertMrpack(
      { kind: 'archive', data: mrpack, sourceName: 'fixture.mrpack' },
      { target: 'client', fetcher },
    )

    expect(result.status).toBe('success')
    expect(result.filesTotal).toBe(2)
    expect(result.filesDownloaded).toBe(2)
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example/client.jar')
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example/shared.jar')
    expect(fetcher).not.toHaveBeenCalledWith('https://cdn.example/server.jar')

    const outputZip = await JSZip.loadAsync(await result.zipBlob.arrayBuffer())
    await expect(outputZip.file('options.txt')?.async('string')).resolves.toBe('shared override')
    await expect(outputZip.file('config/client.toml')?.async('string')).resolves.toBe('client override')
    expect(outputZip.file('config/server.toml')).toBeNull()
    await expect(outputZip.file('mods/client.jar')?.async('string')).resolves.toBe('client jar')
    await expect(outputZip.file('mods/shared.jar')?.async('string')).resolves.toBe('shared jar')
    expect(outputZip.file('mods/server.jar')).toBeNull()
  })

  it('builds a server zip with server-overrides and server-compatible manifest files', async () => {
    const clientJar = bytes('client jar')
    const serverJar = bytes('server jar')
    const mrpack = await makeMrpack(
      {
        name: 'Server Fixture',
        versionId: '2.0.0',
        files: [
          {
            path: 'mods/client.jar',
            downloads: ['https://cdn.example/client.jar'],
            fileSize: clientJar.byteLength,
            hashes: { sha1: sha1(clientJar) },
            env: { client: 'required', server: 'unsupported' },
          },
          {
            path: 'mods/server.jar',
            downloads: ['https://cdn.example/server.jar'],
            fileSize: serverJar.byteLength,
            hashes: { sha1: sha1(serverJar) },
            env: { client: 'unsupported', server: 'required' },
          },
        ],
      },
      {
        'client-overrides/config/client.toml': 'client override',
        'server-overrides/config/server.toml': 'server override',
      },
    )

    const fetcher = vi.fn(async (url: string) => {
      return responseFor(url.endsWith('server.jar') ? serverJar : clientJar)
    })

    const result = await convertMrpack(
      { kind: 'archive', data: mrpack, sourceName: 'server.mrpack' },
      { target: 'server', fetcher },
    )

    expect(result.status).toBe('success')
    expect(result.filesTotal).toBe(1)
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example/server.jar')
    expect(fetcher).not.toHaveBeenCalledWith('https://cdn.example/client.jar')

    const outputZip = await JSZip.loadAsync(await result.zipBlob.arrayBuffer())
    await expect(outputZip.file('config/server.toml')?.async('string')).resolves.toBe('server override')
    expect(outputZip.file('config/client.toml')).toBeNull()
    expect(outputZip.file('mods/client.jar')).toBeNull()
    await expect(outputZip.file('mods/server.jar')?.async('string')).resolves.toBe('server jar')
  })

  it('falls back across downloads and reports hash mismatches as partial conversion', async () => {
    const goodJar = bytes('good jar')
    const wrongJar = bytes('wrong jar')
    const expectedJar = bytes('expected jar')
    const mrpack = await makeMrpack({
      name: 'Partial Fixture',
      versionId: '3.0.0',
      files: [
        {
          path: 'mods/good.jar',
          downloads: ['https://cdn.example/fail.jar', 'https://cdn.example/good.jar'],
          fileSize: goodJar.byteLength,
          hashes: { sha1: sha1(goodJar) },
        },
        {
          path: 'mods/bad.jar',
          downloads: ['https://cdn.example/bad.jar'],
          fileSize: expectedJar.byteLength,
          hashes: { sha1: sha1(expectedJar) },
        },
      ],
    })

    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('fail.jar')) {
        throw new Error('network failed')
      }
      return responseFor(url.endsWith('good.jar') ? goodJar : wrongJar)
    })

    const result = await convertMrpack(
      { kind: 'archive', data: mrpack, sourceName: 'partial.mrpack' },
      { target: 'client', fetcher },
    )

    expect(result.status).toBe('partial')
    expect(result.filesTotal).toBe(2)
    expect(result.filesDownloaded).toBe(1)
    expect(result.filesFailed).toBe(1)
    expect(result.missingFiles).toEqual([
      expect.objectContaining({
        path: 'mods/bad.jar',
        reason: 'hash_mismatch',
      }),
    ])

    const outputZip = await JSZip.loadAsync(await result.zipBlob.arrayBuffer())
    await expect(outputZip.file('mods/good.jar')?.async('string')).resolves.toBe('good jar')
    expect(outputZip.file('mods/bad.jar')).toBeNull()
  })

  it('does not fetch or write unsafe manifest paths', async () => {
    const jar = bytes('unsafe jar')
    const mrpack = await makeMrpack({
      name: 'Unsafe Fixture',
      versionId: '4.0.0',
      files: [
        {
          path: '../escape.jar',
          downloads: ['https://cdn.example/escape.jar'],
          fileSize: jar.byteLength,
          hashes: { sha1: sha1(jar) },
        },
      ],
    })

    const fetcher = vi.fn(async () => responseFor(jar))

    const result = await convertMrpack(
      { kind: 'archive', data: mrpack, sourceName: 'unsafe.mrpack' },
      { target: 'client', fetcher },
    )

    expect(result.status).toBe('partial')
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.missingFiles[0]).toEqual(
      expect.objectContaining({ path: '../escape.jar', reason: 'unsafe_path' }),
    )

    const outputZip = await JSZip.loadAsync(await result.zipBlob.arrayBuffer())
    expect(outputZip.file('../escape.jar')).toBeNull()
    expect(outputZip.file('escape.jar')).toBeNull()
  })

  it('classifies unreadable archives and manifest failures without exposing source data', async () => {
    await expect(
      convertMrpack(
        { kind: 'archive', data: bytes('not a zip'), sourceName: 'private-name.mrpack' },
        { target: 'client' },
      ),
    ).rejects.toMatchObject({ code: 'archive_invalid' })

    const missingManifest = await new JSZip().generateAsync({ type: 'arraybuffer' })
    await expect(
      convertMrpack({ kind: 'archive', data: missingManifest }, { target: 'client' }),
    ).rejects.toMatchObject({ code: 'manifest_missing', message: 'Missing modrinth.index.json.' })

    const invalidManifestZip = new JSZip()
    invalidManifestZip.file('modrinth.index.json', '{not json')
    await expect(
      convertMrpack(
        { kind: 'archive', data: await invalidManifestZip.generateAsync({ type: 'arraybuffer' }) },
        { target: 'client' },
      ),
    ).rejects.toMatchObject({ code: 'manifest_invalid' })
  })

  it('classifies input, lookup, and source download failures', async () => {
    await expect(
      convertMrpack(
        { kind: 'url', url: 'https://cdn.example/not-an-mrpack' },
        { target: 'client', fetcher: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'input_invalid' })

    await expect(
      resolveProjectMrpack('valid-slug', {
        fetcher: vi.fn(async () => {
          throw new Error('network detail')
        }),
      }),
    ).rejects.toMatchObject({ code: 'source_lookup_failed' })

    await expect(
      convertMrpack(
        { kind: 'url', url: 'https://cdn.example/pack.mrpack' },
        {
          target: 'client',
          fetcher: vi.fn(async () => {
            throw new Error('private network detail')
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 'source_download_failed' })
  })
})

describe('resolveProjectMrpack', () => {
  it('distinguishes an invalid project from a temporary Modrinth response failure', async () => {
    await expect(
      resolveProjectMrpack('missing-project', {
        fetcher: vi.fn(async () => new Response('', { status: 404 })),
      }),
    ).rejects.toMatchObject({
      code: 'source_lookup_failed',
      message: 'Invalid Modrinth project ID, slug, or URL.',
    })

    await expect(
      resolveProjectMrpack('valid-project', {
        fetcher: vi.fn(async () => new Response('', { status: 503 })),
      }),
    ).rejects.toMatchObject({
      code: 'source_lookup_failed',
      message: 'Modrinth project lookup is temporarily unavailable. Try again later.',
    })
  })

  it('accepts a Modrinth project URL and selects the newest release with a mrpack file', async () => {
    const fetcher = vi.fn(async () =>
      Response.json([
        {
          id: 'beta-new',
          version_number: '2.0.0-beta',
          version_type: 'beta',
          date_published: '2026-02-01T00:00:00.000Z',
          files: [{ url: 'https://cdn.example/beta.mrpack', filename: 'beta.mrpack' }],
        },
        {
          id: 'release-old',
          version_number: '1.0.0',
          version_type: 'release',
          date_published: '2026-01-01T00:00:00.000Z',
          files: [{ url: 'https://cdn.example/old.mrpack', filename: 'old.mrpack' }],
        },
        {
          id: 'release-new',
          version_number: '1.1.0',
          version_type: 'release',
          date_published: '2026-01-15T00:00:00.000Z',
          files: [{ url: 'https://cdn.example/new.mrpack', filename: 'new.mrpack' }],
        },
      ]),
    )

    const result = await resolveProjectMrpack('https://modrinth.com/modpack/fabulously-optimized', {
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.modrinth.com/v2/project/fabulously-optimized/version',
    )
    expect(result.downloadUrl).toBe('https://cdn.example/new.mrpack')
    expect(result.versionId).toBe('release-new')
    expect(result.warnings).toEqual([])
  })

  it('falls back to the newest non-release mrpack and returns a warning', async () => {
    const fetcher = vi.fn(async () =>
      Response.json([
        {
          id: 'alpha-old',
          version_number: '0.9.0',
          version_type: 'alpha',
          date_published: '2026-01-01T00:00:00.000Z',
          files: [{ url: 'https://cdn.example/old.mrpack', filename: 'old.mrpack' }],
        },
        {
          id: 'beta-new',
          version_number: '1.0.0-beta',
          version_type: 'beta',
          date_published: '2026-02-01T00:00:00.000Z',
          files: [{ url: 'https://cdn.example/beta.mrpack', filename: 'beta.mrpack' }],
        },
      ]),
    )

    const result = await resolveProjectMrpack('abc123', { fetcher })

    expect(result.downloadUrl).toBe('https://cdn.example/beta.mrpack')
    expect(result.warnings).toContain('No release version with a .mrpack file was found; using the latest available version instead.')
  })
})

describe('input helpers and reports', () => {
  it('returns a safe fallback for errors outside the conversion error contract', () => {
    expect(conversionErrorDetails(new ConversionError('manifest_missing', 'Missing manifest.'))).toEqual({
      code: 'manifest_missing',
      message: 'Missing manifest.',
    })
    expect(conversionErrorDetails(new Error('secret URL https://private.example'))).toEqual({
      code: 'unknown',
      message: 'Conversion failed unexpectedly. Try again or check the troubleshooting guide.',
    })
  })

  it('parses project IDs, slugs, and Modrinth project URLs', () => {
    expect(parseProjectIdOrSlug('AANobbMI')).toBe('AANobbMI')
    expect(parseProjectIdOrSlug('fabulously-optimized')).toBe('fabulously-optimized')
    expect(parseProjectIdOrSlug('https://modrinth.com/modpack/fabulously-optimized')).toBe(
      'fabulously-optimized',
    )
    expect(parseProjectIdOrSlug('https://modrinth.com/mod/iris/versions')).toBe('iris')
  })

  it('rejects unsupported project URLs and non-mrpack download URLs', async () => {
    expect(() => parseProjectIdOrSlug('https://example.com/not-modrinth')).toThrow(
      'Use a Modrinth project URL, slug, or project ID.',
    )

    await expect(
      convertMrpack(
        { kind: 'url', url: 'https://cdn.example/version-page' },
        { target: 'client', fetcher: vi.fn() },
      ),
    ).rejects.toThrow('Enter a direct .mrpack download URL.')
  })

  it('creates a text report without exposing source URLs', () => {
    const report = createMissingFilesReport({
      status: 'partial',
      packName: 'Fixture Pack',
      packVersion: '1.0.0',
      target: 'client',
      filesTotal: 2,
      filesDownloaded: 1,
      filesFailed: 1,
      missingFiles: [
        {
          path: 'mods/bad.jar',
          reason: 'hash_mismatch',
          message: 'The downloaded file did not match the manifest hash.',
        },
      ],
      warnings: ['Large packs can take time.'],
    })

    expect(report).toContain('MRPACK to ZIP conversion report')
    expect(report).toContain('Target: client')
    expect(report).toContain('mods/bad.jar - hash_mismatch')
    expect(report).toContain('Large packs can take time.')
    expect(report).not.toContain('https://')
  })
})
