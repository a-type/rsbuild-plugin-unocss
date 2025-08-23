import { GenerateResult, UnocssPluginContext } from "@unocss/core";
import { EventEmitter } from "node:events";

export class Rebuilder {
	building = false;
	#debounceTimeout: NodeJS.Timeout | null = null;
	#events = new EventEmitter<{
		build: [GenerateResult<Set<string>>]
	}>();
	#lastResult: GenerateResult<Set<string>> | null = null;

	constructor(private ctx: UnocssPluginContext, private options?: {
		minify?: boolean;
	}) {
		ctx.onInvalidate(this.invalidate);
	}

	onBuild = (callback: (result: GenerateResult<Set<string>>) => void) => {
		this.#events.on('build', callback);
		return () => {
			this.#events.off('build', callback);
		}
	}

	next = (): Promise<GenerateResult<Set<string>>> => {
		if (this.building) {
		return new Promise((resolve) => {
			this.#events.once('build', resolve);
		});
	} else if (this.#lastResult) {
		return Promise.resolve(this.#lastResult);
	} else {
		return this.rebuild();
	}
	}

	invalidate = () => {
		this.building = true;
		if (this.#debounceTimeout) {
			clearTimeout(this.#debounceTimeout);
		}
		this.#debounceTimeout = setTimeout(this.rebuild, 100);
	}

	rebuild = async () => {
		this.#lastResult = await this.ctx.uno.generate(this.ctx.tokens, this.options);
		this.#events.emit('build', this.#lastResult);
		return this.#lastResult;
	}
}
