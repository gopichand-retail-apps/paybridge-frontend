import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDirectory = fileURLToPath(new URL('.', import.meta.url))
const backendDirectory = resolve(frontendDirectory, '../paybridge-backend')
const selectedMode = process.env.PAYBRIDGE_E2E_MODE ?? 'true'
if (selectedMode !== 'true' && selectedMode !== 'false') {
  throw new Error('PAYBRIDGE_E2E_MODE must be exactly "true" or "false".')
}

const apiOrigin = 'http://127.0.0.1:5604'
const frontendOrigin = 'http://127.0.0.1:5603'
const isMock = selectedMode === 'true'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: frontendOrigin,
  },
  webServer: [
    {
      command: 'mvn -q org.springframework.boot:spring-boot-maven-plugin:3.5.6:run',
      cwd: backendDirectory,
      url: `${apiOrigin}/actuator/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: '5604',
        SPRING_PROFILES_ACTIVE: 'test',
        DATABASE_URL: 'jdbc:h2:mem:paybridge_e2e;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1',
        DATABASE_USERNAME: 'sa',
        DATABASE_PASSWORD: '',
        FRONTEND_ORIGIN: frontendOrigin,
        LOCAL_PROFILE_LOGIN_ENABLED: 'true',
        SESSION_COOKIE_SECURE: 'false',
      },
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5603 --strictPort',
      cwd: frontendDirectory,
      url: frontendOrigin,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        VITE_IS_MOCK: selectedMode,
        VITE_MOCK_API_BASE_URL: isMock ? apiOrigin : 'http://127.0.0.1:1',
        VITE_REAL_API_BASE_URL: isMock ? 'http://127.0.0.1:1' : apiOrigin,
        VITE_API_BASE_URL: '',
        PAYBRIDGE_API_PROXY_TARGET: 'http://127.0.0.1:1',
      },
    },
  ],
})
