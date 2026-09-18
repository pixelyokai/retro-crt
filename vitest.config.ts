import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/site/test/**/*.test.ts'],
    environment: 'node',
  },
})
