import { expect, test } from '@playwright/test';
import { createRsbuild } from '@rsbuild/core';
import { presetMini } from 'unocss';
import { pluginUnoCss } from '../../src';
import { expectAppliedStyles, getRandomPort } from '../helper';

const basicPlugin = pluginUnoCss({
	config: {
		presets: [presetMini()],
		content: {
			pipeline: {
				include: [/\.(jsx|ts|tsx)($|\?)/],
			},
		},
	},
});

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
	expect(await page.evaluate('window.test')).toBe(1);

	await expectAppliedStyles(page, '#test-element', {
		margin: '8px',
		background: 'rgb(255, 0, 0)',
	});

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
	expect(await page.evaluate('window.test')).toBe(1);

	await expectAppliedStyles(page, '#test-element', {
		margin: '8px',
		background: 'rgb(255, 0, 0)',
	});

	await server.close();
});
