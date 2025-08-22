import { defineConfig } from '@rsbuild/core';
import { presetMini, transformerVariantGroup } from 'unocss';
import { pluginExample } from '../src';

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
