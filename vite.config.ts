import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const proxyTarget = environment.PAYBRIDGE_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:5602'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: false,
        },
        '/actuator': {
          target: proxyTarget,
          changeOrigin: false,
        },
      },
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      coverage: {
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
        reporter: ['text', 'html', 'lcov'],
        thresholds: {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
          'src/api.ts': {
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
          },
          'src/config.ts': {
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
          },
          'src/domain/money.ts': {
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
          },
        },
      },
    },
  }
})
