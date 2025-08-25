# @a-type/rsbuild-plugin-unocss

[WIP] A minimal but stable Rsbuild plugin for UnoCSS, handwritten for Rsbuild instead of unplugin.

> ⚠️ Performance in this early version seems pretty bad. I intend to improve it, but don't expect quick rebuilds if you adopt early.

<p>
  <a href="https://npmjs.com/package/@a-type/rsbuild-plugin-unocss">
   <img src="https://img.shields.io/npm/v/rsbuild-plugin-unocss?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  <a href="https://npmcharts.com/compare/@a-type/rsbuild-plugin-unocss?minimal=true"><img src="https://img.shields.io/npm/dm/@a-type/rsbuild-plugin-unocss.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
</p>

## Features

This plugin doesn't support all UnoCSS features, but it does support some features not available in PostCSS and some workflows I wanted to experiment with for external libraries.

- ✅ Transforms: rewrites source files (`pre` transforms only for now)
- ✅ Filesystem watches in addition to bundled files (using `unoConfig.content.filesystem`)
- ✅ Process `// @unocss-include` comments on selected external modules, even if not matched by your `content.pipeline` rules. This one makes it easy to add this magic comment to your output files in a component library and then run Uno on its output files when it's used in your actual app!
- 🚫 Uno config watching (TODO)
- 🚫 Uno scopes (not actually sure what these are)

## Usage

Install:

```bash
npm add @a-type/rsbuild-plugin-unocss -D
```

Add plugin to your `rsbuild.config.ts`:

```ts
// rsbuild.config.ts
import { pluginUnoCss } from "@a-type/rsbuild-plugin-unocss";

export default {
  plugins: [pluginUnoCss({
    config: // a path or literal Uno config
  })],
};
```

Import `uno.css` in your app:

```ts
import 'uno.css';
```

## Options

### config

A path to an Uno config, or a literal config object. Otherwise it should be inferred as `uno.config.ts`.

- Type: `string`
- Default: `undefined`
- Example:

```js
pluginUnoCss({
	config: 'uno.branded.config.ts',
});
```

### enableIncludeCommentCheck

Pass a filter function which takes the absolute path of a bundled source file and returns `true` if you want to check it for an `@unocss-include` comment.

- Type: `(filePath: string) => boolean`
- Default: `undefined`
- Example:

```js
pluginUnoCss({
	enableIncludeCommentCheck: (filePath) =>
		// make sure your test is compatible with OS-dependent path formats
		// by using path.join.
		// I also recommend including the dist/output dir in your test, to avoid
		// nested node_modules.
		filePath.includes(path.join('@your-scope', 'component-library', 'dist')),
});
```

### enableCacheExtractedCSS

Pass a filter function to enable caching the extracted CSS classes from particular files. By default this caches any extractions from files in `node_modules` (see `enableIncludeCommentCheck` for why you might have extracted files from `node_modules`).

You may need to change this if you are in a monorepo and want to extract CSS from other projects linked via `node_modules`. Without excluding them using this filter, their initial extracted CSS will be cached and they won't be scanned for changes. Return `false` for files matching your monorepo projects to re-enable live CSS reloading on them.

- Type: `(filePath: string) => boolean`
- Default: `(filePath: string) => filePath.includes('node_modules')`
- Example:

```js
pluginUnoCss({
	enableCacheExtractedCSS: (filePath) =>
		filePath.includes(`@my-monorepo-scope`)
			? false
			: filePath.includes('node_modules'),
});
```

## License

[MIT](./LICENSE).
