import { defineConfig, presetMini, transformerVariantGroup } from 'unocss';

export default defineConfig({
  content: {
    pipeline: {
      include: [/\.(jsx|ts|tsx)($|\?)/],
    },
  },
  presets: [presetMini()],
  transformers: [transformerVariantGroup()],
});
