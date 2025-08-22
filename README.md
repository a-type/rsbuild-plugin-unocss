# @a-type/rsbuild-plugin-unocss

[WIP] A minimal but stable Rsbuild plugin for UnoCSS, handwritten for Rsbuild instead of unplugin.

<p>
  <a href="https://npmjs.com/package/@-type/rsbuild-plugin-unocss">
   <img src="https://img.shields.io/npm/v/rsbuild-plugin-unocss?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  <a href="https://npmcharts.com/compare/@a-type/rsbuild-plugin-unocss?minimal=true"><img src="https://img.shields.io/npm/dm/@a-type/rsbuild-plugin-unocss.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
</p>

## Warning

I do not know what I'm doing. But I am frustrated with the race condition bug that's plagued me in the 'official' UnoCSS Rspack plugin (air quotes as it's not documented) and my attempts at debugging it were not successful.

Rsbuild plugins are not quite as verbose or hard to reason about as Rspack/Webpack, so I figured I'd try to build my own from scratch targeting Rsbuild only. No frills, I just need:

1. My transformers applied to source code
2. Uno's CSS emitted and importable via `uno.css`
3. Hot reloading that always works on the first try
4. 1 & 2 to also work during build

I have something that appears to work but I'm just guessing at this, I don't know if I've done it right yet. Caveat emptor.

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

## License

[MIT](./LICENSE).
