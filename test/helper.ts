import type { Page } from '@playwright/test';

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

	await page.waitForFunction(
		({ selector, expected }) => {
			const el = document.querySelector(selector);
			if (!el) return null;
			for (const [prop, value] of Object.entries(expected)) {
				const computed = getComputedStyle(el)[prop as any];
				if (computed !== value) {
					return false;
				}
			}
			return true;
		},
		{ selector: elementSelector, expected: styles },
	);
}
