import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginUnoCss } from '../src/index.js';

export default defineConfig({
	plugins: [
		pluginUnoCss({
			enableIncludeCommentCheck: (filePath) => {
				return (
					filePath.endsWith('jsFile.js') ||
					// example of including an external NPM module which has
					// annotated its dist files with @unocss-include. This is
					// useful for external component libraries.
					filePath.includes(path.join('@a-type', 'ui', 'dist'))
				);
			},
			debug: true,
			events: {
				onCssBuildBegan: (tokenCount) => {
					console.log(`CSS build started with ${tokenCount} tokens`);
				},
				onCssInvalidated: (tokenCount) => {
					console.log(`CSS invalidated with ${tokenCount} tokens`);
				},
				onCssGenerated: (css) => {
					console.log(`CSS generated with length ${css.length}`);
				},
				onCssResolved: (result) => {
					console.log(
						`CSS resolved with ${result.matched.size} matched tokens`,
					);
				},
			},
		}),
		pluginReact(),
	],
	server: {
		port: 3001,
		strictPort: true,
	},
});
