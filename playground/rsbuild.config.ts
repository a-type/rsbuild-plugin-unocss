import { defineConfig } from '@rsbuild/core';
import { pluginUnoCss } from '../src/index.js';

export default defineConfig({
  plugins: [
    pluginUnoCss(),
  ],
  server: {
    port: 3001,
    strictPort: true,
  },
});
