import { mkdirSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import type { RsbuildPlugin } from '@rsbuild/core';
import type { UserConfig } from '@unocss/core';
import { createContext } from './integrationUtil/context.js';
import { resolveId } from './integrationUtil/layers.js';
import { applyTransformers } from './integrationUtil/transformers.js';

export type PluginExampleOptions = {
  config?: UserConfig<any> | string;
};

export const pluginExample = (
  options: PluginExampleOptions = {},
): RsbuildPlugin => ({
  name: 'plugin-example',

  setup(api) {
    console.log('Loading UnoCSS Plugin...');
    // load plugin context
    const ctx = createContext(options.config);

    const virtualModulesDir = resolve(
      api.getRsbuildConfig()?.root ?? process.cwd(),
      'node_modules/.virtual',
    );

    mkdirSync(virtualModulesDir, { recursive: true });
    writeFileSync(virtualModulesDir + resolveId('uno.css'), '');

    api.modifyEnvironmentConfig((config, { mergeEnvironmentConfig }) => {
      return mergeEnvironmentConfig(config, {
        source: {
          include: [virtualModulesDir],
        },
      });
    });

    // apply transforms to incoming TS files
    // and trigger extraction on them as we
    // receive them.
    api.transform(
      {
        // TODO: build filter from pipeline rules
        test: /\.tsx?$/,
      },
      async ({ code, resource, emitFile, addDependency }) => {
        addDependency(virtualModulesDir + resolveId('uno.css'));
        addDependency('uno.css');

        console.log('Transforming source', resource);
        let final = code;
        const result = await applyTransformers(ctx, code, resource, 'pre');
        if (result) {
          console.log('Transformed', result.code);
          final = result.code;
        }

        await ctx.extract(final, resource);
        const cssResult = await ctx.uno.generate(ctx.tokens, { minify: false });
        console.log('Generated CSS:', cssResult.css);
        await fs.writeFile(
          virtualModulesDir + resolveId('uno.css'),
          cssResult.css,
        );
        emitFile(virtualModulesDir + resolveId('uno.css'), cssResult.css);

        return final;
      },
    );

    // add our virtual "uno.css" module as an asset.
    // this asset is just a placeholder for now.
    // api.processAssets(
    //   {
    //     stage: 'additional',
    //   },
    //   async ({ assets, sources, compilation }) => {
    //     Object.keys(assets).forEach((assetName) => {
    //       console.log('asset', assetName);
    //     });
    //     const mainId = resolveId('uno.css');
    //     if (mainId) {
    //       const virtualId = posix.join(virtualModulesDir, mainId);
    //       console.log('Emitting asset for UnoCSS:', virtualId);
    //       await ctx.flushTasks();
    //       const result = await ctx.uno.generate(ctx.tokens, { minify: false });
    //       const source = new sources.RawSource(result.css);
    //       console.log('Generated CSS:', result.css);
    //       writeFileSync(virtualId, result.css);
    //     }
    //   },
    // );

    // match and map `import 'uno.css';` to our
    // virtual module location in node_modules/.virtual
    api.resolve(({ resolveData }) => {
      // if the request matches an uno.css module
      const entry = resolveId(resolveData.request);
      if (!entry || entry === resolveData.request) {
        return;
      }

      // preserve query
      let query = '';
      const queryIndex = resolveData.request.indexOf('?');
      if (queryIndex >= 0) {
        query = resolveData.request.slice(queryIndex);
      }
      const parsedQuery = new URLSearchParams(query);
      // add token count to query to break cache when new tokens are added
      parsedQuery.append('tokens', ctx.tokens.size.toString());
      const rewritten = posix.join(
        virtualModulesDir,
        entry + '?' + parsedQuery.toString(),
      );
      console.log('Rewriting resolution for UnoCSS:', rewritten);
      resolveData.request = rewritten;
    });
  },
});
