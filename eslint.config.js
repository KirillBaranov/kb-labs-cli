import { createConfig } from '@kb-labs/devkit/eslint/node.js'

export default createConfig({
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
  ],
})
