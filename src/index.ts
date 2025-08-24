import fs from 'node:fs/promises';
import path from 'node:path';
import {
	mergeRsbuildConfig,
	type RsbuildPlugin,
	type TransformHandler,
} from '@rsbuild/core';
import type { UserConfig } from '@unocss/core';
import { pluginVirtualModule } from 'rsbuild-plugin-virtual-module';
import { setupContentExtractor } from './integrationUtil/content.js';
import { createContext } from './integrationUtil/context.js';
import { applyTransformers } from './integrationUtil/transformers.js';
import { Rebuilder } from './Rebuilder.js';

export type PluginUnoCssOptions = {
	config?: UserConfig<any> | string;
	/**
	 * Enables checking every resource for
	 * @unocss-include comments, even if they don't match
	 * the pipeline content rules in your config.
	 * Disabled by default as it's not efficient and I'm not sure it works
	 * correctly.
	 */
	enableIncludeCommentCheck?: boolean;
};

export const pluginUnoCss = (
	options: PluginUnoCssOptions = {},
): RsbuildPlugin[] => {
	const ctx = createContext(options.config);
	const rebuilder = new Rebuilder(ctx);

	const virtualModulesDir = '.rsbuild-virtual-module';
	const triggerFileName = 'trigger.txt';
	const triggerFilePath = path.resolve(
		'node_modules',
		virtualModulesDir,
		triggerFileName,
	);

	const unoPlugin: RsbuildPlugin = {
		name: 'plugin-unocss',

		setup(api) {
			//  watch filesystem and inline dependencies.
			// TODO: how to detect --watch arg to build, too?
			setupContentExtractor(ctx, api.context.action === 'dev');

			// when Uno invalidates, write a new unique value to the
			// trigger file.
			ctx.onInvalidate(async () => {
				await fs.writeFile(
					triggerFilePath,
					`this file exists to trigger Uno rebuilds. tokens: ${ctx.tokens.size}`,
				);
			});

			api.modifyRsbuildConfig((config) => {
				return mergeRsbuildConfig(
					{
						tools: {
							rspack: {
								watchOptions: {
									// don't ignore watch on our virtual modules dir
									ignored:
										/[\\/](?:\.git|node_modules(?![\\/]\.rsbuild-virtual-module))[\\/]/,
								},
							},
						},
					},
					config,
				);
			});

			const transformAndExtractSource: TransformHandler = async ({
				code,
				resource,
			}) => {
				api.logger.info('Transforming source', resource);
				let final = code;
				// transformers like variant-group will rewrite the source
				// so we apply them now.
				const result = await applyTransformers(ctx, code, resource, 'pre');
				if (result) {
					final = result.code;
				}
				// await extraction on source rebuild. we await here,
				// rather than doing it out-of-band, to ensure we don't
				// hit a race condition where uno.css is resolved and
				// loaded before extraction of a new token is complete.
				// If that happened, the class for the new token would
				// not yet be available when the user loads the resource
				// and it would have no applied styles until the next
				// change.
				// An opportunity exists here to think of a more efficient
				// way to parallelize extraction and block uno.css loading
				// until it's complete without stopping here, but until
				// that's thought up, we prefer correctness.
				await ctx.extract(final, resource);
				return final;
			};

			// apply transforms to incoming TS files
			// and trigger extraction on them as we
			// receive them.
			api.transform(
				{
					test: (id: string) => ctx.filter('', id),
				},
				transformAndExtractSource,
			);

			if (options.enableIncludeCommentCheck) {
				api.transform(
					{
						test: (resource) => !resource.includes('node_modules'),
					},
					(handlerInfo) => {
						console.log(handlerInfo.resource);
						if (ctx.filter(handlerInfo.code, handlerInfo.resource)) {
							return transformAndExtractSource(handlerInfo);
						}
						return handlerInfo.code;
					},
				);
			}

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
				}
			});
		},
	};

	const unoVirtualModulesPlugin = pluginVirtualModule({
		virtualModules: {
			'uno.css': async ({ addDependency }) => {
				// explicitly depend on our 'trigger' file which
				// invalidates our CSS programmatically when it is
				// written.
				addDependency(triggerFilePath);
				// next() will either trigger new build if no prior
				// CSS exists, return the cached build, or wait until
				// an in-progress build is complete.
				const result = await rebuilder.next();
				return result.css;
			},
		},
		tempDir: virtualModulesDir,
	});

	return [unoVirtualModulesPlugin, unoPlugin];
};
