import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { appMarkup } from './src/app-markup'

const appRootPlaceholder = '<div id="app"></div>'
const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: entry('index.html'),
        blog: entry('blog/index.html'),
        howToConvertMrpackToZip: entry('blog/how-to-convert-mrpack-to-zip/index.html'),
        launcherZipVsServerZip: entry('blog/launcher-zip-vs-server-zip/index.html'),
      },
    },
  },
  plugins: [
    {
      name: 'static-app-markup',
      transformIndexHtml(html, context) {
        const shouldInjectAppMarkup =
          !context || context.path === '/' || context.path === '/index.html' || html.includes('/src/main.ts')

        if (!shouldInjectAppMarkup) {
          return html
        }

        if (!html.includes(appRootPlaceholder)) {
          throw new Error('Missing app root placeholder for static markup injection.')
        }

        return html.replace(appRootPlaceholder, `<div id="app">${appMarkup()}</div>`)
      },
    },
  ],
})
