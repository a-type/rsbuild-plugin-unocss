import preset from '@a-type/ui/uno-preset';
import { defineConfig, transformerVariantGroup } from 'unocss';

export default defineConfig({
  content: {
    pipeline: {
      include: [/\.(jsx|ts|tsx)($|\?)/],
    },
    filesystem: [
      './external/external.ts'
    ]
  },
  presets: [preset({
    // easier to see what's going on without preflight
    noPreflight: true
  })],
  transformers: [transformerVariantGroup()],
});
