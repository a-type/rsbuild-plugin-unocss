import { EventEmitter } from 'node:events';
import type { GenerateResult, UnocssPluginContext } from '@unocss/core';

export class Rebuilder {
	#debounceTimeout: NodeJS.Timeout | null = null;
	#debounceMs = 100;
	#events = new EventEmitter<{
		build: [GenerateResult<Set<string>>];
		beginBuild: [number];
	}>();
	#nextResultPromise: Promise<GenerateResult<Set<string>>> | null = null;
	#invalidations = 0;
	#lastBuildResult: {
		invalidations: number;
		result: GenerateResult<Set<string>>;
	} | null = null;
	#log: (level: 'info' | 'debug', ...args: any[]) => void = () => {};

	get #buildQueued() {
		return !!this.#debounceTimeout;
	}

	get #lastResult() {
		if (
			this.#lastBuildResult &&
			this.#lastBuildResult.invalidations === this.#invalidations
		) {
			return this.#lastBuildResult.result;
		}
		return null;
	}

	constructor(
		private ctx: UnocssPluginContext,
		private options?: {
			minify?: boolean;
			debug?: boolean;
			debounceMs?: number;
		},
	) {
		if (options?.debounceMs !== undefined) {
			this.#debounceMs = options.debounceMs;
		}
		this.#events.setMaxListeners(1000); // .once usage in next() means peak count is = number of active invalidations, so bump this.
	}

	configure(log: (...args: any[]) => void) {
		this.#log = log;
	}

	onBuild = (callback: (result: GenerateResult<Set<string>>) => void) => {
		this.#events.on('build', callback);
		return () => {
			this.#events.off('build', callback);
		};
	};
	onBeginBuild = (callback: (tokens: number) => void) => {
		this.#events.on('beginBuild', callback);
		return () => {
			this.#events.off('beginBuild', callback);
		};
	};

	next = (): Promise<GenerateResult<Set<string>>> => {
		if (this.#lastResult) {
			this.#log('info', 'up to date, returning last result');
			return Promise.resolve(this.#lastResult);
		}
		if (this.#nextResultPromise) {
			this.#log('info', 'waiting for in progress build');
			return this.#nextResultPromise.then((result) => {
				this.#log('info', 'in progress build complete, returning result');
				return result;
			});
		} else if (this.#buildQueued) {
			// debounce timeout is active, but nothing is building yet.
			// we wait for the next build event, then retrigger next(),
			// which will either resolve the cached last result or await
			// a newly triggered build or debounce if another invalidation
			// happened since.
			this.#log('info', 'build queued, waiting for it to start');
			return new Promise((resolve) =>
				this.#events.once('build', () => {
					this.#log('info', 'queued build complete');
					this.next().then(resolve);
				}),
			);
		} else {
			this.#log('info', 'triggering build from idle');
			return this.rebuild();
		}
	};

	invalidate = () => {
		this.#invalidations++;
		if (this.#debounceTimeout) {
			clearTimeout(this.#debounceTimeout);
		}
		this.#debounceTimeout = setTimeout(
			this.#invalidationRebuild,
			this.#debounceMs,
		);
	};

	#invalidationRebuild = () => {
		this.#log('info', 'debounce complete, rebuilding');
		clearTimeout(this.#debounceTimeout!);
		this.#debounceTimeout = null;
		this.#nextResultPromise = this.rebuild().finally(() => {
			this.#nextResultPromise = null;
		});
	};

	rebuild = async () => {
		const currentInvalidation = this.#invalidations;
		this.#events.emit('beginBuild', this.ctx.tokens.size);
		// important to have a sync path between invalidate and this assignment.
		const result = await this.ctx.uno.generate(this.ctx.tokens, this.options);

		if (currentInvalidation !== this.#invalidations) {
			// another invalidation triggered while building. wait for the next build.
			this.#log('info', 'build invalidated during generation, skipping result');
			return this.next();
		}

		this.#log('info', 'build complete', 'tokens:', this.ctx.tokens.size);
		this.#lastBuildResult = { invalidations: currentInvalidation, result };
		this.#events.emit('build', result);
		return result;
	};
}
