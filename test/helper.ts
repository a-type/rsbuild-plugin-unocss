import { expect, type Page } from '@playwright/test';

const portMap = new Map();

export function getRandomPort(
	defaultPort = Math.ceil(Math.random() * 30000) + 15000,
) {
	let port = defaultPort;
	while (true) {
		if (!portMap.get(port)) {
			portMap.set(port, 1);
			return port;
		}
		port++;
	}
}

export async function expectAppliedStyles(
	page: Page,
	elementSelector: string,
	styles: Record<string, string>,
) {
	await page.locator(elementSelector).waitFor({
		state: 'attached',
		timeout: 10000,
	});
	expect(
		await page.evaluate(
			({ selector, styleKeys }) => {
				const el = document.querySelector(selector);
				if (!el) return null;
				return styleKeys.reduce(
					(acc, key) => {
						acc[key] = getComputedStyle(el)[key];
						return acc;
					},
					{} as Record<string, string>,
				);
			},
			{ selector: elementSelector, styleKeys: Object.keys(styles) },
		),
	).toEqual(styles);
}
