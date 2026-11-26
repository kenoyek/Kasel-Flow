import { defineConfig } from 'vite'
import { kaselPwa } from './server/pwa.js'
import { createAssistantHandler } from './server/assistant.js'

export default defineConfig({
  plugins: [kaselPwa(), {
    name: 'kasel-local-assistant',
    configureServer(server) {
      server.middlewares.use('/api/local-assistant', createAssistantHandler())
    },
  }],
})
