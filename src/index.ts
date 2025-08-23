import type { RsbuildDevServer, RsbuildPlugin } from '@rsbuild/core';
import type { UserConfig } from '@unocss/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path, { posix, resolve } from 'node:path';
import { setupContentExtractor } from './integrationUtil/content.js';
import { createContext } from './integrationUtil/context.js';
import { resolveId } from './integrationUtil/layers.js';
import { applyTransformers } from './integrationUtil/transformers.js';
import { Rebuilder } from './Rebuilder.js';

export type PluginUnoCssOptions = {
  config?: UserConfig<any> | string;
};

export const pluginUnoCss = (
  options: PluginUnoCssOptions = {},
): RsbuildPlugin => ({
  name: 'plugin-example',

  setup(api) {
    // load plugin context
    const ctx = createContext(options.config);

    let devServer: RsbuildDevServer | undefined = undefined;
    api.onBeforeStartDevServer(({ server }) => {
      devServer = server;
    });

    const rebuilder = new Rebuilder(ctx);
    rebuilder.onBuild(async (result) => {
      await fs.writeFile(
        virtualModulesDir + resolveId('uno.css'),
        `
@import "./trigger.css";
${result.css}
`,
      );
      api.logger.info('🔄️ Regenerated CSS');
      await fs.writeFile(
        virtualModulesDir + '/trigger.js',
        'export const tokens = ' +
          ctx.tokens.size +
          '; //' +
          Date.now().toString(),
      );
      await fs.writeFile(
        virtualModulesDir + '/trigger.css',
        `.uno-nonce {
  --uno-nonce: ${ctx.tokens.size};
s}`,
      );
    });

    const virtualModulesDir = resolve(
      api.getRsbuildConfig()?.root ?? process.cwd(),
      'node_modules/.virtual',
    );

    mkdirSync(virtualModulesDir, { recursive: true });
    writeFileSync(
      virtualModulesDir + resolveId('uno.css'),
      '@import "./trigger.css";',
    );
    writeFileSync(virtualModulesDir + '/trigger.js', '');
    writeFileSync(virtualModulesDir + '/trigger.css', '');

    //  watch filesystem and inline dependencies.
    setupContentExtractor(ctx, api.context.action === 'dev');

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
      async ({ code, resource }) => {
        api.logger.info('Transforming source', resource);
        let final = code;
        const result = await applyTransformers(ctx, code, resource, 'pre');
        if (result) {
          final = result.code;
        }

        await ctx.extract(final, resource);
        await rebuilder.next();

        return final;
      },
    );
    api.transform(
      {
        test: virtualModulesDir + resolveId('uno.css'),
      },
      async ({ code, addDependency }) => {
        api.logger.info('Transforming uno.css');
        // using this empty file to manually trigger hot
        // reloads of the CSS.
        const triggerPath = path.resolve(virtualModulesDir, 'trigger.css');
        api.logger.info(`Watching ${triggerPath} for changes`);
        addDependency(triggerPath);
        return code;
      },
    );
    api.transform(
      {
        test: virtualModulesDir + '/trigger.js',
      },
      ({ code }) => {
        api.logger.info('Transforming trigger.js');
        return code;
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
      api.logger.info('Token count', ctx.tokens.size);
      const rewritten = posix.join(
        virtualModulesDir,
        `${entry}?${parsedQuery.toString()}`,
      );
      api.logger.info('Rewriting resolution for UnoCSS:', rewritten);
      resolveData.request = rewritten;
    });

    api.onDevCompileDone(() => {
      api.logger.info('💽 Dev Compile Done');
    });
  },
});
