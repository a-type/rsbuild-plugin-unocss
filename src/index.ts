import type { RsbuildPlugin } from '@rsbuild/core';
import type { UserConfig } from '@unocss/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { createContext } from './integrationUtil/context.js';
import { resolveId } from './integrationUtil/layers.js';
import { applyTransformers } from './integrationUtil/transformers.js';

export type PluginUnoCssOptions = {
  config?: UserConfig<any> | string;
};

export const pluginUnoCss = (
  options: PluginUnoCssOptions = {},
): RsbuildPlugin => ({
  name: 'plugin-example',

  setup(api) {
    // load plugin context
    let invalidated = false;
    const ctx = createContext(options.config);
    ctx.onInvalidate(() => {
      invalidated = true;
    });
    function resetInvalidated() {
      invalidated = false;
    }

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
      async ({ code, resource, emitFile }) => {
        api.logger.debug('Transforming source', resource);
        let final = code;
        const result = await applyTransformers(ctx, code, resource, 'pre');
        if (result) {
          final = result.code;
        }

        await ctx.extract(final, resource);
        if (invalidated) {
          resetInvalidated();
          const cssResult = await ctx.uno.generate(ctx.tokens, {
            minify: false,
          });
          api.logger.info('🔄️ Regenerated CSS');
          await fs.writeFile(
            virtualModulesDir + resolveId('uno.css'),
            cssResult.css,
          );
          emitFile(virtualModulesDir + resolveId('uno.css'), cssResult.css);
        }
        return final;
      },
    );

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
      api.logger.info('Rewriting resolution for UnoCSS:', rewritten);
      resolveData.request = rewritten;
    });
  },
});
