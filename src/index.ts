import { mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
	mergeRsbuildConfig,
	type RsbuildPlugin,
	type TransformHandler,
} from '@rsbuild/core';
import type { UserConfig } from '@unocss/core';
import { pluginVirtualModule } from 'rsbuild-plugin-virtual-module';
import { IGNORE_COMMENT } from './integrationUtil/constants.js';
import { setupContentExtractor } from './integrationUtil/content.js';
import { createContext } from './integrationUtil/context.js';
import { applyTransformers } from './integrationUtil/transformers.js';
import { Rebuilder } from './Rebuilder.js';

export type PluginUnoCssOptions = {
	config?: UserConfig<any> | string;
	/**
	 * Enables checking every resource for
	 * @unocss-include comments, even if they don't match
	 * the pipeline content rules in your config. Pass a function
	 * which accepts the full file path of the processed file
	 * and returns true if you want to check for an include comment.
	 *
	 * For example, if you have a separate component library,
	 * you could add the include comment to its output sources
	 * and then check whether the tested file matches the name
	 * of your library in its path.
	 *
	 * NOTE: the path is not normalized per-OS; if you include
	 * path separators be sure to test platform-agnostically, for
	 * example using path.join().
	 *
	 * Disabled by default as it's not efficient and
	 * I'm not sure it works correctly.
	 */
	enableIncludeCommentCheck?: (filePath: string) => boolean;
	/**
	 * Choose files which should have their CSS extraction cached
	 * during dev/watch mode after it's first processed. These
	 * should be files which never change during development.
	 * Defaults to anything in node_modules. Changing this is
	 * only necessary if you are linking live project files into
	 * node_modules, for example in a monorepo.
	 */
	enableCacheExtractedCSS?: (filePath: string) => boolean;
	/**
	 * Adds logs to indicate what the plugin is doing
	 */
	debug?: boolean;
};

export const pluginUnoCss = (
	options: PluginUnoCssOptions = {},
): RsbuildPlugin[] => {
	const ctx = createContext({ configOrPath: options.config });
	const rebuilder = new Rebuilder(ctx);

	const cachedExtractions = new Set<string>();
	const shouldCache =
		options?.enableCacheExtractedCSS ??
		((filePath) => filePath.includes('node_modules'));
	const extractedFiles = new Set<string>();

	const virtualModulesDirName = '.uno-virtual-module';
	const triggerFileName = 'uno.trigger';
	// temporarily use a naive path resolved from cwd while
	// we wait for plugin startup to provide a more reliable
	// root.
	let triggerFilePath = path.resolve(
		process.cwd(),
		'node_modules',
		virtualModulesDirName,
		triggerFileName,
	);

	const unoPlugin: RsbuildPlugin = {
		name: 'plugin-unocss',

		setup(api) {
			const resolvedVirtualModulesDir = path.resolve(
				api.context.rootPath,
				'node_modules',
				virtualModulesDirName,
			);
			// now we have api.context.rootPath; update our trigger file
			// path
			triggerFilePath = path.join(resolvedVirtualModulesDir, triggerFileName);
			// ensure the virtual modules directory exists.
			mkdirSync(resolvedVirtualModulesDir, { recursive: true });

			//  watch filesystem and inline dependencies.
			// TODO: how to detect --watch arg to build, too?
			setupContentExtractor(ctx, api.context.action === 'dev');

			// when Uno invalidates, write a new unique value to the
			// trigger file.
			ctx.onInvalidate(async () => {
				options.debug && api.logger.info('UnoCSS invalidated');
				await fs.writeFile(triggerFilePath, `uno-nonce: ${ctx.tokens.size}`);
			});
			if (options.debug) {
				rebuilder.onBuild(() => {
					api.logger.info('Rebuilt UnoCSS, tokens:', ctx.tokens.size);
				});
			}

			api.modifyRsbuildConfig((config) => {
				return mergeRsbuildConfig(
					{
						tools: {
							rspack: {
								watchOptions: {
									// don't ignore watch on our virtual modules dir
									ignored: new RegExp(
										`[\\/](?:\.git|node_modules(?![\\/]${virtualModulesDirName}))[\\/]`,
									),
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
				// check for exclude, this is not done in the transformer
				// filter.
				if (code.startsWith(`// ${IGNORE_COMMENT}`)) {
					return code;
				}

				options.debug && api.logger.info('Transforming source', resource);
				let final = code;
				// transformers like variant-group will rewrite the source
				// so we apply them now.
				const result = await applyTransformers(ctx, code, resource, 'pre');
				if (result) {
					final = result.code;
				}
				if (!cachedExtractions.has(resource)) {
					// add to cache if user selects to. this file will
					// not be extracted again.
					if (shouldCache(resource)) {
						options.debug && api.logger.info('Caching extracted CSS', resource);
						cachedExtractions.add(resource);
					} else {
						extractedFiles.add(resource);
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
				} else {
					options.debug &&
						api.logger.info('Skipping extraction for cached CSS', resource);
				}
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
						test: options.enableIncludeCommentCheck,
					},
					(handlerInfo) => {
						if (ctx.filter(handlerInfo.code, handlerInfo.resource)) {
							return transformAndExtractSource(handlerInfo);
						}
						return handlerInfo.code;
					},
				);
			}
		},
	};

	const unoVirtualModulesPlugin = pluginVirtualModule({
		virtualModules: {
			'uno.css': async ({ addDependency }) => {
				options.debug && console.info('debug   generating UnoCSS');
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
		tempDir: virtualModulesDirName,
	});

	return [unoVirtualModulesPlugin, unoPlugin];
};
