import { expect, test } from '@playwright/test';
import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { presetMini } from 'unocss';
import { pluginUnoCss } from '../../src';
import { expectAppliedStyles } from '../helper';

const workdir = 'tmp';
const workingFile = path.join(import.meta.dirname, workdir, 'Component.tsx');

test.beforeAll(async () => {
	// setup workdir
	await fs.mkdir(path.join(import.meta.dirname, workdir), { recursive: true });
	await fs.copyFile(
		path.join(import.meta.dirname, 'src/index.tsx'),
		path.join(import.meta.dirname, workdir, 'index.tsx'),
	);
	await fs.copyFile(
		path.join(import.meta.dirname, 'src/Component.tsx'),
		path.join(import.meta.dirname, workdir, 'Component.tsx'),
	);
	return async () => {
		await fs.rmdir(path.join(import.meta.dirname, workdir), {
			recursive: true,
		});
	};
});

test('should hot reload new classes without losing React state', async ({
	page,
}) => {
	let cssGeneratedCount = 0;
	await page.route('**/*.css', (route) => {
		console.log('CSS request:', route.request().url());
		return route.continue();
	});

	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		config: {
			plugins: [
				pluginUnoCss({
					logLevel: 'info',
					events: {
						onCssGenerated: (result) => {
							cssGeneratedCount++;
							console.log(
								`CSS generated #${cssGeneratedCount}:`,
								result.css?.slice(0, 100),
								'...',
								result.css?.slice(-100),
							);
						},
					},
					config: {
						presets: [presetMini()],
						content: {
							pipeline: {
								include: [/\.(jsx|ts|tsx)($|\?)/],
							},
						},
					},
				}),
				pluginReact(),
			],
			server: {
				port: 3033, // getRandomPort(),
			},
			source: {
				entry: {
					index: path.join(import.meta.dirname, 'tmp', 'index.tsx'),
				},
			},
		},
	});

	const { server, urls } = await rsbuild.startDevServer();

	await page.goto(urls[0]);

	await expectAppliedStyles(page, '#test', {
		'background-color': 'rgb(255, 0, 0)',
	});

	expect(cssGeneratedCount).toBeGreaterThan(0);

	// store the stateful value of the element content, this tells
	// us if the page was fully reloaded or not
	const elementContent = await page.evaluate(() => {
		return (document.getElementById('test') as HTMLElement).textContent;
	});

	// make changes that add classes, make sure the styling is updated
	const currentContent = await fs.readFile(workingFile, 'utf-8');
	await fs.writeFile(
		workingFile,
		currentContent
			.replace('bg-[red]', 'bg-[green]')
			.replace('replace-me', 'hmr done'),
	);

	await page.waitForResponse(
		async (res) => {
			const body = await res.body();
			return res.url().includes('.css') && body.includes('green');
		},
		{
			timeout: 5000,
		},
	);

	await expectAppliedStyles(page, '#test', {
		'background-color': 'rgb(0, 128, 0)',
	});

	const newElementContent = await page.evaluate(() => {
		return (document.getElementById('test') as HTMLElement).textContent;
	});

	expect(elementContent).toBe(newElementContent);

	// make rapid changes that add classes, make sure the styling is updated
	let hexColor = 0xff0000;

	// run out of band
	console.log('Starting rapid changes');
	(async () => {
		for (let i = 0; i < 30; i++) {
			hexColor += 1;
			const currentContent = await fs.readFile(workingFile, 'utf-8');
			await fs.writeFile(
				workingFile,
				currentContent
					.replace(/bg-\[#[a-f0-9]{6}\]/, `bg-[#${hexColor.toString(16)}]`)
					.replace('bg-[green]', `bg-[#${hexColor.toString(16)}]`),
			);
			// delay 20mms
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	})();

	// begin looking for the final build
	let lastCss = '';
	try {
		await page.waitForResponse(
			async (res) => {
				if (!res.url().includes('.css')) return false;
				const body = await res.body();
				lastCss = body.toString();
				return body.includes(`#${hexColor.toString(16)}`);
			},
			{
				timeout: 10000,
			},
		);
	} catch (e) {
		console.error(
			'Failed to find CSS response with expected color. Last CSS:',
			lastCss,
		);
		throw e;
	}

	await expectAppliedStyles(page, '#test', {
		'background-color': `rgb(${(hexColor >> 16) & 0xff}, ${(hexColor >> 8) & 0xff}, ${hexColor & 0xff})`,
	});

	await server.close();
});
