import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/voice-token': {
          target: 'https://vocalbridgeai.com',
          changeOrigin: true,
          rewrite: () => '/api/v1/token',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-API-Key', env.VITE_VOCAL_BRIDGE_API_KEY || '')
              if (env.VITE_VOCAL_BRIDGE_AGENT_ID) {
                proxyReq.setHeader('X-Agent-Id', env.VITE_VOCAL_BRIDGE_AGENT_ID)
              }
            })
          },
        },
      },
    },
  }
})
