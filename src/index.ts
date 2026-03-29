import type { RsbuildPlugin, TransformHandler } from '@rsbuild/core';
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
		onCssExtracted?: (filePath: string, tokens: string[]) => void;
	};
	/**
	 * Modify debounce timing for rebuilds. Default is 100ms.
	 */
	debounceMs?: number;

	__experimental_speedy?: boolean;
};

export const pluginUnoCss = (
	options: PluginUnoCssOptions = {},
): RsbuildPlugin[] => {
	const virtualModuleId = 'node_modules/uno.css';
	const ctx = createContext({ configOrPath: options.config });
	const rebuilder = new Rebuilder(ctx, options);
	let resolveFirstCompile!: () => void;
	const firstCompilePromise = new Promise<void>((resolve) => {
		resolveFirstCompile = resolve;
	});

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
			function log(level: 'info' | 'debug' | 'warn', ...args: any[]) {
				if (
					options.logLevel === 'debug' ||
					(options.logLevel === 'info' && level === 'info') ||
					level === 'warn'
				) {
					api.logger.info('[UnoCSS]', Date.now(), ...args);
				}
			}
			rebuilder.configure(log);
			const cleanups: (() => void)[] = [];

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

				config.plugins.push({
					apply(compiler) {
						// this is just for one-time builds... ensures the CSS gets
						// collected before the build is complete.
						if (api.context.action === 'build') {
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
						}

						// resolve first build
						compiler.hooks.thisCompilation.tap('UnoCSS', () => {
							resolveFirstCompile();
							log('debug', 'UnoCSS first compilation started');
						});
					},
				} satisfies rspack.RspackPluginInstance);

				config.watchOptions = {
					...config.watchOptions,
					// don't ignore watch on our virtual module
					ignored: /[\\/](?:node_modules(?![\\/]uno.css))[\\/]/,
				};
				return config;
			});

			ctx.onInvalidate(async () => {
				rebuilder.invalidate();
				log('debug', `UnoCSS invalidated (${ctx.tokens.size} tokens)`);
				options.events?.onCssInvalidated?.(ctx.tokens.size);
			});

			if (api.context.action === 'dev') {
				rebuilder.onBuild(async (result) => {
					// we must wait for the startup routine to initialize the Rust portion
					// or else the virtual module write will fail...
					await firstCompilePromise;
					options.events?.onCssGenerated?.(result.css);
					baseVirtualModulesPlugin.writeModule(virtualModuleId, result.css);
					log('debug', 'UnoCSS build result written to virtual module');
				});
			}
			rebuilder.onBeginBuild((tokenCount) =>
				options.events?.onCssBuildBegan?.(tokenCount),
			);

			let beforeExtractTokens = new Set<string>();
			if (options.events?.onCssExtracted) {
				log(
					'warn',
					'onCssExtracted event listener was provided - this can negatively impact build performance',
				);
			}

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
					const extractionPromise = ctx.extract(final, resource).then(() => {
						log('debug', 'Finished extracting CSS from source', resource);
						if (options.events?.onCssExtracted) {
							const tokenDifference = new Set(ctx.tokens);
							beforeExtractTokens.forEach((t) => tokenDifference.delete(t));
							beforeExtractTokens = new Set(ctx.tokens);
							options.events.onCssExtracted(resource, Array.from(ctx.tokens));
						}
					});
					// speedy mode skips waiting for extraction and trusts that the
					// extraction -> invalidate -> rebuild -> deliver cycle works.
					if (!options.__experimental_speedy) {
						await extractionPromise;
					}
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
