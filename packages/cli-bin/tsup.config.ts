import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  tsconfig: "tsconfig.build.json", // Используем конфиг без paths, чтобы избежать бандлинга workspace пакетов
  clean: false,
  dts: {
    resolve: false,
  },
  // nodePreset уже включает все workspace пакеты через tsup.external.json
  // (генерируется через kb-devkit-tsup-external) и regex /^@kb-labs\//
  // Не нужно переопределять external - используем preset как есть
  // banner не нужен - shebang уже есть в src/bin.ts
});
