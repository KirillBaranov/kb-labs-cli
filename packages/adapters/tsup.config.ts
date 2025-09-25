import config from '@kb-labs/devkit/tsup/node.js'

export default {
  ...config,
  entry: {
    index: 'src/index.ts',
  },
  external: ['ajv', 'ajv-formats', 'yaml', 'picomatch'],
  clean: false
}