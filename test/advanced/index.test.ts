import { expect, type Page, test } from '@playwright/test';
import { createRsbuild } from '@rsbuild/core';
import { presetMini, transformerVariantGroup } from 'unocss';
import { pluginUnoCss } from '../../src';
import { expectAppliedStyles, getRandomPort } from '../helper';

const basicPlugin = pluginUnoCss({
	debug: true,
	config: {
		presets: [presetMini()],
		transformers: [transformerVariantGroup()],
		content: {
			pipeline: {
				include: [/\.(jsx|ts|tsx)($|\?)/],
			},
			filesystem: ['./src/unimported.ts'],
		},
	},
});

async function testProcedure(page: Page) {
	await expectAppliedStyles(page, '#test-element', {
		'background-color': 'rgb(255, 0, 0)',
	});

	const el = page.locator('#test-element');
	await el.focus();
	expect(el).toBeFocused();
	await expectAppliedStyles(page, '#test-element', {
		'background-color': 'rgb(0, 0, 255)',
		margin: '8px',
		color: 'rgb(255, 255, 255)',
		'font-weight': '700',
	});

	// add a runtime element which matches the classes extracted
	// from the filesystem dependency. this will test if those
	// classes were correctly added to the generated css
	await page.evaluate(() => {
		const el = document.createElement('div');
		el.textContent = 'created';
		el.id = 'created';
		el.classList.add('absolute');
		document.body.appendChild(el);
	});

	await expectAppliedStyles(page, '#created', {
		position: 'absolute',
	});
}

test('should render page as expected', async ({ page }) => {
	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		rsbuildConfig: {
			plugins: [basicPlugin],
			server: {
				port: getRandomPort(),
			},
		},
	});

	const { server, urls } = await rsbuild.startDevServer();

	await page.goto(urls[0]);

	await testProcedure(page);

	await server.close();
});

test('should build succeed', async ({ page }) => {
	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		rsbuildConfig: {
			plugins: [basicPlugin],
		},
	});

	await rsbuild.build();
	const { server, urls } = await rsbuild.preview();

	await page.goto(urls[0]);

	await testProcedure(page);

	await server.close();
});
