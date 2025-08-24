import { EventEmitter } from 'node:events';
import type { GenerateResult, UnocssPluginContext } from '@unocss/core';

export class Rebuilder {
	building = false;
	#debounceTimeout: NodeJS.Timeout | null = null;
	#events = new EventEmitter<{
		build: [GenerateResult<Set<string>>];
	}>();
	#lastResult: GenerateResult<Set<string>> | null = null;

	constructor(
		private ctx: UnocssPluginContext,
		private options?: {
			minify?: boolean;
			debug?: boolean;
		},
	) {
		ctx.onInvalidate(this.invalidate);
	}

	#log = (...args: any[]) => {
		if (this.options?.debug) {
			console.log('[UnoCSS Rebuild]', ...args);
		}
	};

	onBuild = (callback: (result: GenerateResult<Set<string>>) => void) => {
		this.#events.on('build', callback);
		return () => {
			this.#events.off('build', callback);
		};
	};

	next = (): Promise<GenerateResult<Set<string>>> => {
		if (this.building) {
			this.#log('waiting for in progress build');
			return new Promise((resolve) => {
				this.#events.once('build', resolve);
			});
		} else if (this.#lastResult) {
			this.#log('returning cached result');
			return Promise.resolve(this.#lastResult);
		} else {
			this.#log('triggering rebuild');
			return this.rebuild();
		}
	};

	invalidate = () => {
		this.building = true;
		if (this.#debounceTimeout) {
			clearTimeout(this.#debounceTimeout);
		}
		this.#debounceTimeout = setTimeout(this.rebuild, 100);
	};

	rebuild = async () => {
		this.#lastResult = await this.ctx.uno.generate(
			this.ctx.tokens,
			this.options,
		);
		this.building = false;
		this.#log('build complete', 'tokens:', this.ctx.tokens.size);
		this.#events.emit('build', this.#lastResult);
		return this.#lastResult;
	};
}
