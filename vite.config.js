import { defineConfig } from 'vite'
import { createAssistantHandler } from './server/assistant.js'

export default defineConfig({
  plugins: [{
    name: 'kasel-local-assistant',
    configureServer(server) {
      server.middlewares.use('/api/local-assistant', createAssistantHandler())
    },
  }],
})
