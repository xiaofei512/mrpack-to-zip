export function appMarkup() {
  return `
    <header class="site-header">
      <a class="site-brand" href="/" aria-label="MRPACK to ZIP homepage">
        <span class="brand-mark" aria-hidden="true">↧</span>
        <span>MRPACK to ZIP</span>
      </a>
      <nav class="site-nav" aria-label="Primary navigation">
        <a aria-current="page" href="/">Converter</a>
        <a href="/blog/">Guides</a>
        <a href="/blog/how-to-convert-mrpack-to-zip/">How to convert</a>
        <a href="/blog/launcher-zip-vs-server-zip/">ZIP outputs</a>
      </nav>
    </header>

    <main class="shell">
      <section class="hero-panel" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">Client-side Modrinth pack utility</p>
          <h1 id="page-title">MRPACK to ZIP Converter</h1>
          <p class="lede">Convert Modrinth .mrpack files into launcher-ready ZIP packages in your browser. Upload a local file, paste a direct URL, or start from a Modrinth project ID.</p>
          <div class="trust-strip" aria-label="Tool boundaries">
            <span>Launcher ZIP ready</span>
            <span>Processed in browser</span>
            <span>Hash checked</span>
            <span>Missing report</span>
          </div>
        </div>

        <form id="converter-form" class="tool-panel">
          <section class="tool-section" aria-labelledby="source-heading">
            <h2 id="source-heading">Choose source</h2>
            <div class="source-grid" aria-label="Source type">
              <label class="mode-card source-card">
                <input type="radio" name="source" value="project" aria-label="Project ID">
                <span data-lucide="file-archive" aria-hidden="true"></span>
                <strong>Project ID</strong>
                <small>From Modrinth</small>
              </label>
              <label class="mode-card source-card">
                <input type="radio" name="source" value="url" aria-label="From URL">
                <span data-lucide="link" aria-hidden="true"></span>
                <strong>From URL</strong>
                <small>Paste download link</small>
              </label>
              <label class="mode-card source-card">
                <input type="radio" name="source" value="upload" aria-label="Upload File" checked>
                <span data-lucide="upload" aria-hidden="true"></span>
                <strong>Upload File</strong>
                <small>Local .mrpack</small>
              </label>
            </div>
          </section>

          <div class="input-stack">
            <section class="field-block" data-source-panel="project" hidden>
              <label class="field-label" for="project-id"><i data-lucide="file-archive" aria-hidden="true"></i>Modrinth project ID, slug, or URL</label>
              <input id="project-id" type="text" autocomplete="off" aria-label="Modrinth project ID, slug, or URL" placeholder="fabulously-optimized or https://modrinth.com/modpack/...">
              <small>Use a Modrinth project page URL, project slug, or project ID.</small>
            </section>
            <section class="field-block" data-source-panel="url" hidden>
              <label class="field-label" for="mrpack-url"><i data-lucide="link" aria-hidden="true"></i>Direct .mrpack download URL</label>
              <input id="mrpack-url" type="url" inputmode="url" aria-label="Paste .mrpack download URL" placeholder="https://cdn.modrinth.com/.../pack.mrpack">
              <small>Paste a URL that points directly to a .mrpack file.</small>
            </section>
            <section class="field-block upload-dropzone" data-source-panel="upload">
              <label class="field-label" for="mrpack-file"><i data-lucide="upload" aria-hidden="true"></i>Local .mrpack file</label>
              <span class="file-picker">
                <input id="mrpack-file" class="file-input-native" type="file" accept=".mrpack" aria-label="Upload .mrpack file">
                <span class="file-picker-button">
                  <span data-lucide="upload" aria-hidden="true"></span>
                  <strong>Drop your .mrpack file here</strong>
                  <small>or click to browse files</small>
                </span>
              </span>
              <small id="file-name">No file selected</small>
            </section>
          </div>

          <section class="tool-section package-section" aria-labelledby="package-heading">
            <h2 id="package-heading">Package type</h2>
            <div class="default-package">
              <span data-lucide="monitor" aria-hidden="true"></span>
              <div>
                <strong>Launcher ZIP <span>(recommended)</span></strong>
                <small>For launcher imports and manual installs.</small>
              </div>
            </div>
            <details class="advanced-options">
              <summary><span data-lucide="settings-2" aria-hidden="true"></span>Advanced</summary>
              <label class="server-toggle">
                <input type="checkbox" name="target" value="server" aria-label="Build a Server ZIP instead">
                <span data-lucide="server" aria-hidden="true"></span>
                <span>
                  <strong>Build a Server ZIP instead</strong>
                  <small>Uses server-compatible files when the pack marks them. Not a one-click server setup.</small>
                </span>
              </label>
            </details>
          </section>

          <button id="convert-button" class="primary-action" type="submit"><span data-lucide="download" aria-hidden="true"></span>Convert file to ZIP</button>

          <section id="status-panel" class="status-panel" data-state="idle" aria-live="polite" aria-busy="false">
            <h2 id="status-title">Ready</h2>
            <p id="status-body">Local files are processed in your browser. Remote URLs are fetched directly by your browser.</p>
            <progress id="progress" value="0" max="1" hidden></progress>
            <ul id="warning-list" class="warning-list"></ul>
            <ul id="missing-list" class="missing-list"></ul>
            <div id="result-actions" class="result-actions" hidden>
              <button id="download-zip" type="button"><span data-lucide="download" aria-hidden="true"></span>Download ZIP</button>
              <button id="copy-missing" type="button"><span data-lucide="clipboard-copy" aria-hidden="true"></span>Copy missing file list</button>
              <button id="download-report" type="button"><span data-lucide="file-archive" aria-hidden="true"></span>Download report .txt</button>
            </div>
          </section>
        </form>
      </section>

      <section class="content-band guide-band" aria-labelledby="conversion-guide">
        <h2 id="conversion-guide">How to use this converter</h2>
        <ol class="guide-steps">
          <li>
            <strong>Choose your source</strong>
            <p>Upload a local <code>.mrpack</code> file, paste a direct <code>.mrpack</code> URL, or enter a Modrinth project URL, slug, or ID.</p>
          </li>
          <li>
            <strong>Keep Launcher ZIP selected</strong>
            <p>Use the recommended Launcher ZIP for launcher imports and manual installs. Open Advanced only when you need a server-targeted ZIP.</p>
          </li>
          <li>
            <strong>Click Convert</strong>
            <p>The browser reads the pack manifest, fetches listed files, checks supported hashes, and builds the ZIP locally.</p>
          </li>
          <li>
            <strong>Download the result</strong>
            <p>Click <strong>Download ZIP</strong> when conversion finishes.</p>
          </li>
          <li>
            <strong>Review missing files if needed</strong>
            <p>If files are missing, copy or download the missing file report and handle those files manually from the pack page.</p>
          </li>
        </ol>
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

      <section class="content-band launcher-band" aria-labelledby="launcher-support">
        <h2 id="launcher-support">Which launchers need ZIP?</h2>
        <p class="section-intro">Not every Minecraft launcher opens Modrinth .mrpack files directly. Use this table as a practical guide, and check your launcher version when behavior varies.</p>
        <div class="table-wrap">
          <table class="launcher-table">
            <thead>
              <tr>
                <th>Launcher</th>
                <th>Native .mrpack support</th>
                <th>ZIP often needed</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Prism Launcher</td>
                <td>Yes</td>
                <td>No</td>
                <td>Usually imports Modrinth packs directly.</td>
              </tr>
              <tr>
                <td>MultiMC</td>
                <td>Yes</td>
                <td>No</td>
                <td>Modrinth packs are supported by current builds.</td>
              </tr>
              <tr>
                <td>ATLauncher</td>
                <td>Yes</td>
                <td>No</td>
                <td>Listed by Modrinth as a compatible launcher.</td>
              </tr>
              <tr>
                <td>GDLauncher</td>
                <td>Yes</td>
                <td>No</td>
                <td>Can import Modrinth .mrpack packs.</td>
              </tr>
              <tr>
                <td>CurseForge</td>
                <td>Varies</td>
                <td>Sometimes</td>
                <td>Import behavior depends on pack format and launcher version.</td>
              </tr>
              <tr>
                <td>Official Minecraft Launcher</td>
                <td>No pack import</td>
                <td>Yes</td>
                <td>Use ZIP files for manual installs or external tooling.</td>
              </tr>
              <tr>
                <td>Technic</td>
                <td>No</td>
                <td>Yes</td>
                <td>ZIP-style pack files are commonly used.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="content-band guides-band" aria-labelledby="guides">
        <h2 id="guides">MRPACK conversion guides</h2>
        <p class="section-intro">Use these guides when you need the exact conversion steps or want to understand the Launcher ZIP and Server ZIP outputs before downloading.</p>
        <div class="process-grid guide-links">
          <article>
            <strong><a href="/blog/how-to-convert-mrpack-to-zip/">How to convert MRPACK to ZIP</a></strong>
            <p>Upload a local file, use a Modrinth project ID, or paste a direct .mrpack URL.</p>
          </article>
          <article>
            <strong><a href="/blog/launcher-zip-vs-server-zip/">Launcher ZIP vs Server ZIP</a></strong>
            <p>Choose the right output and learn why some converted ZIPs can look the same.</p>
          </article>
          <article>
            <strong><a href="/blog/">All guides</a></strong>
            <p>Browse the current MRPACK to ZIP guide library.</p>
          </article>
          <article>
            <strong><a href="/">Open the converter</a></strong>
            <p>Go back to the tool and build the ZIP in your browser.</p>
          </article>
        </div>
      </section>

      <section class="content-band faq-band" aria-labelledby="faq">
        <h2 id="faq">FAQ</h2>
        <details open><summary>What is an MRPACK file?</summary><p>An MRPACK file is a ZIP-based Modrinth modpack manifest with override folders and download instructions.</p></details>
        <details><summary>How do I convert MRPACK to ZIP?</summary><p>Choose a local file, paste a direct .mrpack URL, or enter a Modrinth project. Then convert the launcher ZIP, or use Advanced to build a server-targeted ZIP.</p></details>
        <details><summary>Why is an MRPACK file not the same as a normal ZIP?</summary><p>An .mrpack file usually stores a manifest and override folders, while many mod files are referenced by download URLs and hashes. This tool rebuilds a regular ZIP by reading that manifest and fetching the referenced files.</p></details>
        <details><summary>What is a Launcher ZIP?</summary><p>A Launcher ZIP is the default output for launcher imports and manual installs. It includes files that the pack marks as usable on the client side.</p></details>
        <details><summary>What is a Server ZIP?</summary><p>A Server ZIP is an advanced output that uses server-compatible files when the pack marks them. It is not a one-click server setup and may still need manual server configuration.</p></details>
        <details><summary>Is my MRPACK file uploaded?</summary><p>No. Local files are processed inside your browser. Remote URL and project modes fetch remote files directly from your browser.</p></details>
        <details><summary>Why are some mods missing from the ZIP?</summary><p>Some files may be hosted outside Modrinth or blocked by CORS. Missing files are listed so you can handle them manually.</p></details>
        <details><summary>What does hash checked mean?</summary><p>When the manifest provides a supported hash, the downloaded file is checked against it. A mismatch is reported instead of silently adding the wrong file.</p></details>
        <details><summary>Is this an official Modrinth tool?</summary><p>No. This is an independent tool and is not affiliated with Modrinth, Mojang, Microsoft, Minecraft, or pack authors.</p></details>
      </section>
    </main>
  `
}
