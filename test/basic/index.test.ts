import { expect, test } from '@playwright/test';
import { createRsbuild } from '@rsbuild/core';
import { presetMini } from 'unocss';
import { pluginUnoCss } from '../../src';
import { expectAppliedStyles, getRandomPort } from '../helper';

const basicPlugin = pluginUnoCss({
	logLevel: 'info',
	config: {
		presets: [presetMini()],
		content: {
			pipeline: {
				include: [/\.(js|jsx|ts|tsx)($|\?)/],
			},
		},
	},
});

test('should render page as expected', async ({ page }) => {
	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		config: {
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
		'background-color': 'rgb(255, 0, 0)',
	});

	await server.close();
});

test('should build and succeed', async ({ page }) => {
	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		rsbuildConfig: {
			plugins: [basicPlugin],
		},
	});

	const result = await rsbuild.build();
	await result.close();
	const { server, urls } = await rsbuild.preview({
		getPortSilently: true,
	});

	await page.goto(urls[0]);
	expect(await page.evaluate('window.test')).toBe(1);

	await expectAppliedStyles(page, '#test-element', {
		margin: '8px',
		'background-color': 'rgb(255, 0, 0)',
	});

	await server.close();
});
