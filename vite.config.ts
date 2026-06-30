import { defineConfig } from 'vite'
import { appMarkup } from './src/app-markup'

const appRootPlaceholder = '<div id="app"></div>'

export default defineConfig({
  plugins: [
    {
      name: 'static-app-markup',
      transformIndexHtml(html) {
        if (!html.includes(appRootPlaceholder)) {
          throw new Error('Missing app root placeholder for static markup injection.')
        }

        return html.replace(appRootPlaceholder, `<div id="app">${appMarkup()}</div>`)
      },
    },
  ],
})
