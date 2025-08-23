import fs from 'node:fs/promises';
import path from 'node:path';
import type { RsbuildPlugin } from '@rsbuild/core';
import type { UserConfig } from '@unocss/core';
import { pluginVirtualModule } from 'rsbuild-plugin-virtual-module';
import { setupContentExtractor } from './integrationUtil/content.js';
import { createContext } from './integrationUtil/context.js';
import { applyTransformers } from './integrationUtil/transformers.js';
import { Rebuilder } from './Rebuilder.js';

export type PluginUnoCssOptions = {
  config?: UserConfig<any> | string;
};

export const pluginUnoCss = (
  options: PluginUnoCssOptions = {},
): RsbuildPlugin[] => {
  const ctx = createContext(options.config);
  const rebuilder = new Rebuilder(ctx);

  // when Uno invalidates, write a new unique value to the
  // trigger file.
  const virtualModulesDir = '.rsbuild-virtual-module';
  const triggerFilePath = path.resolve(
    'node_modules',
    virtualModulesDir,
    'trigger.css',
  );
  ctx.onInvalidate(async () => {
    console.info('🔄️ Regenerated CSS');
    await fs.writeFile(
      triggerFilePath,
      `.uno-nonce {
  --uno-nonce: ${ctx.tokens.size};
}`,
    );
  });

  const unoPlugin: RsbuildPlugin = {
    name: 'plugin-unocss',

    setup(api) {
      //  watch filesystem and inline dependencies.
      setupContentExtractor(ctx, api.context.action === 'dev');

      // apply transforms to incoming TS files
      // and trigger extraction on them as we
      // receive them.
      api.transform(
        {
          // TODO: build filter from pipeline rules
          test: /\.tsx?$/,
        },
        async ({ code, resource }) => {
          api.logger.info('Transforming source', resource);
          let final = code;
          const result = await applyTransformers(ctx, code, resource, 'pre');
          if (result) {
            final = result.code;
          }

          await ctx.extract(final, resource);
          // I think we don't need to wait here, as this will
          // be awaited in the transformer for uno.css itself.
          // await rebuilder.next();

          return final;
        },
      );

      // adds a nonce to any imports of "uno.css" which changes
      // whenever the CSS is invalidated (tokens changed),
      // so that the underlying code is not cached after invalidation.
      api.resolve(({ resolveData }) => {
        const [base, search] = resolveData.request.split('?');
        if (base === 'uno.css') {
          // add latest nonce as query
          const params = new URLSearchParams(search);
          params.set('tokens', ctx.tokens.size.toString());
          resolveData.request = `${base}?${params.toString()}`;
          api.logger.info('Resolved uno.css to', resolveData.request);
        }
      });

      api.onDevCompileDone(() => {
        api.logger.info('💽 Dev Compile Done');
      });
    },
  };

  const unoVirtualModulesPlugin = pluginVirtualModule({
    virtualModules: {
      'uno.css': async ({ addDependency }) => {
        console.log('Resolving uno.css virtual module');
        const result = await rebuilder.next();
        console.log('Adding dependency on', triggerFilePath);
        addDependency(triggerFilePath);
        return `@import "./trigger.css";
${result.css}`;
      },
    },
  });

  return [unoVirtualModulesPlugin, unoPlugin];
};
