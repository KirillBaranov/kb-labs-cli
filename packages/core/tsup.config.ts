import baseConfig from '@kb-labs/devkit/tsup/node.js'

export default {
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
  },
  external: ['ajv', 'ajv-formats', 'yaml', 'picomatch']
}
