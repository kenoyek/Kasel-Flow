import { defineConfig, loadEnv } from 'vite'
import { kaselPwa } from './server/pwa.js'
import { createAssistantHandler } from './server/assistant.js'

export default defineConfig(({mode}) => {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_')
  if (Boolean(url) !== Boolean(key) || (key && !key.startsWith('sb_publishable_'))) {
    throw new Error('Configure both Supabase variables using a publishable key, or omit both for demo mode.')
  }

  return {plugins: [kaselPwa(), {
    name: 'kasel-local-assistant',
    configureServer(server) {
      server.middlewares.use('/api/local-assistant', createAssistantHandler())
    },
  }]}
})
