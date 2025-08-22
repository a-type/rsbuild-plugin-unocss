import { defineConfig } from '@rsbuild/core';
import { pluginExample } from '../src';
import { presetMini, transformerVariantGroup } from 'unocss';

export default defineConfig({
  plugins: [
    pluginExample({
      config: {
        presets: [presetMini()],
        transformers: [transformerVariantGroup()],
      },
    }),
  ],
  server: {
    port: 3001,
  },
});
