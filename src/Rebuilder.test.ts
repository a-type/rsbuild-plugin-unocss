import type { UnocssPluginContext } from '@unocss/core';
import { expect, it, vi } from 'vitest';
import { Rebuilder } from './Rebuilder.js';

it('should debounce rebuilds', async () => {
	let onInvalidate!: () => void;
	const onBuild = vi.fn();
	const generate = vi.fn().mockResolvedValue({
		css: 'fake css',
	});
	const ctx = {
		onInvalidate: (cb: any) => {
			onInvalidate = cb;
		},
		uno: {
			generate,
		},
		tokens: {
			size: 0,
		},
	} as any as UnocssPluginContext;
	const rebuilder = new Rebuilder(ctx);
	rebuilder.onBuild(onBuild);

	vi.useFakeTimers();

	for (let i = 0; i < 5; i++) {
		onInvalidate();
	}

	expect(ctx.uno.generate).toHaveBeenCalledTimes(0);

	vi.advanceTimersByTime(110);

	expect(ctx.uno.generate).toHaveBeenCalledTimes(1);
});
