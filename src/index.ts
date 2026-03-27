import { type RsbuildPlugin, type TransformHandler } from '@rsbuild/core';
import rspack from '@rspack/core';
import type { UserConfig } from '@unocss/core';
import { type FSWatcher, watch } from 'chokidar';
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
	 * Not for use on live reloaded source files!
	 *
	 * Indicate files which should have their CSS extraction cached
	 * INDEFINITELY during dev/watch mode after they are first processed.
	 * These should be files which never change during development.
	 * Defaults to anything in node_modules. Changing this is
	 * only necessary if you are linking live project files into
	 * node_modules, for example in a monorepo.
	 *
	 * Selectively caching files can keep builds quick by skipping
	 * files you know will never change.
	 */
	enableCacheExtractedCSS?: (filePath: string) => boolean;
	/**
	 * Selectively disable applying your Uno transforms on specific files.
	 * This can speed up builds if you know certain files don't need
	 * transforms, particularly if you have included pre-transformed
	 * files in your content.pipeline configuration.
	 */
	disableTransform?: (filePath: string) => boolean;
	/**
	 * Adds logs to indicate what the plugin is doing
	 */
	logLevel?: 'debug' | 'info';
	/**
	 * Whether to minify the generated CSS.
	 */
	minify?: boolean;
	/**
	 * Used for testing, but you can subscribe if you want.
	 */
	events?: {
		onCssInvalidated?: (tokenCount: number) => void;
		onCssGenerated?: (css: string) => void;
		onCssBuildBegan?: (tokenCount: number) => void;
	};
	/**
	 * Modify debounce timing for rebuilds. Default is 100ms.
	 */
	debounceMs?: number;
};

export const pluginUnoCss = (
	options: PluginUnoCssOptions = {},
): RsbuildPlugin[] => {
	const virtualModuleId = 'node_modules/uno.css';
	const ctx = createContext({ configOrPath: options.config });
	const rebuilder = new Rebuilder(ctx, options);

	const cachedExtractions = new Set<string>();
	const shouldCache =
		options?.enableCacheExtractedCSS ??
		((filePath) => filePath.includes('node_modules'));
	const disableTransform =
		options?.disableTransform ??
		((filePath) => filePath.includes('node_modules'));

	const unoPlugin: RsbuildPlugin = {
		name: 'plugin-unocss',

		setup(api) {
			function log(level: 'info' | 'debug', ...args: any[]) {
				if (
					options.logLevel === 'debug' ||
					(options.logLevel === 'info' && level === 'info')
				) {
					api.logger.info('[UnoCSS]', Date.now(), ...args);
				}
			}
			rebuilder.configure(log);
			let cleanups: (() => void)[] = [];

			const emptyContent = 'body { --unocss-plugin-initializing: 1; }';
			const baseVirtualModulesPlugin =
				new rspack.experiments.VirtualModulesPlugin({
					[virtualModuleId]: emptyContent,
				});

			ctx.updateRoot(api.context.rootPath).then(() => {
				log('info', 'Updated root path:', api.context.rootPath);
			});

			//  watch filesystem and inline dependencies.
			// TODO: how to detect --watch arg to build, too?
			const watchExtractedFiles = api.context.action === 'dev';
			const contentExtractionPromise = setupContentExtractor(
				ctx,
				watchExtractedFiles,
			).then((files) => {
				log(
					'info',
					`${watchExtractedFiles ? 'Watching' : 'Extracted'} filesystem content:`,
					files,
				);
			});

			api.onBeforeBuild(async () => {
				await contentExtractionPromise;
			});

			api.onAfterBuild(() => {
				log('info', 'Build finished, cleaning up');
				cachedExtractions.clear();
				cleanups.forEach((fn) => fn());
			});

			api.modifyRspackConfig((config) => {
				config.plugins.push(baseVirtualModulesPlugin);

				// this is just for one-time builds... ensures the CSS gets
				// collected before the build is complete.
				if (api.context.action === 'build') {
					config.plugins.push({
						apply(compiler) {
							async function rebuild() {
								const result = await rebuilder.next();
								baseVirtualModulesPlugin.writeModule(
									virtualModuleId,
									result.css,
								);
								options.events?.onCssGenerated?.(result.css);
							}

							// experimentally, these are both necessary, even though
							// the second one only gets the precompiled/cached copy...

							// this one is really meant to capture things, but...
							compiler.hooks.make.tapPromise('UnoCSS', rebuild);
							// without this one it seems the file doesn't get written?
							compiler.hooks.afterCompile.tapPromise('UnoCSS', rebuild);
						},
					} satisfies rspack.RspackPluginInstance);
				}

				config.watchOptions = {
					...config.watchOptions,
					// don't ignore watch on our virtual module
					ignored: new RegExp(`[\\/](?:node_modules(?![\\/]uno\.css))[\\/]`),
				};
				return config;
			});

			ctx.onInvalidate(async () => {
				rebuilder.invalidate();
				log('debug', `UnoCSS invalidated (${ctx.tokens.size} tokens)`);
				options.events?.onCssInvalidated?.(ctx.tokens.size);
			});

			if (api.context.action === 'dev') {
				rebuilder.onBuild((result) => {
					options.events?.onCssGenerated?.(result.css);
					baseVirtualModulesPlugin.writeModule(virtualModuleId, result.css);
					log('debug', 'UnoCSS build result written to virtual module');
				});
			}
			rebuilder.onBeginBuild((tokenCount) =>
				options.events?.onCssBuildBegan?.(tokenCount),
			);

			const transformAndExtractSource: TransformHandler = async ({
				code,
				resource,
			}) => {
				// check for exclude, this is not done in the transformer
				// filter.
				if (code.startsWith(`// ${IGNORE_COMMENT}`)) {
					return code;
				}

				let final = code;
				if (!disableTransform(resource)) {
					log('debug', 'Transforming source', resource);
					// transformers like variant-group will rewrite the source
					// so we apply them now.
					const result = await applyTransformers(ctx, code, resource, 'pre');
					if (result) {
						final = result.code;
					}
				}

				if (!cachedExtractions.has(resource)) {
					// add to cache if user selects to. this file will
					// not be extracted again.
					if (shouldCache(resource)) {
						log('debug', 'Caching extracted CSS', resource);
						cachedExtractions.add(resource);
					} else {
						log('debug', 'Not caching extracted CSS', resource);
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
					log('debug', 'Finished extracting CSS from source', resource);
				} else {
					log('debug', 'Skipping extraction for cached CSS', resource);
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

			// watch for config changes and trigger reloads.
			let watchedConfigFiles: string[];
			let watcher: FSWatcher;
			api.onBeforeStartDevServer(() => {
				ctx.ready.then(({ sources }) => {
					log(
						'info',
						'UnoCSS config loaded with sources:',
						sources,
						'Directories will be watched recursively.',
					);
					watchedConfigFiles = sources;
					async function watchConfig() {
						if (watcher) {
							await watcher.close();
						}
						watcher = watch(watchedConfigFiles, {
							ignoreInitial: true,
						}).on('all', async (event, changedPath) => {
							log('info', `Config file ${event} detected:`, changedPath);
							await ctx.reloadConfig().then(({ sources }) => {
								watchedConfigFiles = sources;
								log('info', 'UnoCSS config reloaded with sources:', sources);
								watchConfig();
							});
						});
					}
					watchConfig();
				});
			});
		},
	};

	return [unoPlugin];
};
