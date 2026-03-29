import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import presetAtype from '@a-type/ui/uno-preset';
import { expect, type Page, test } from '@playwright/test';
import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { transformerVariantGroup } from 'unocss';
import { pluginUnoCss } from '../../src';
import { expectAppliedStyles, getRandomPort } from '../helper';

async function testProcedure(page: Page) {
	await expectAppliedStyles(page, '#test-element', {
		'background-color': 'rgb(255, 0, 0)',
	});

	const el = page.locator('#test-element');
	await el.focus();
	await expect(el).toBeFocused();
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

	// custom CSS styles not related to Uno should be preserved
	await expectAppliedStyles(page, '.uniqueToThisTest', {
		'border-radius': '10px',
	});
}

test('should render page as expected', async ({ page }) => {
	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		config: {
			plugins: [
				pluginUnoCss({
					logLevel: 'info',
					config: {
						presets: [presetAtype()],
						transformers: [transformerVariantGroup()],
						content: {
							pipeline: {
								include: [/\.(jsx|ts|tsx)($|\?)/],
							},
							filesystem: ['./src/unimported.ts'],
						},
					},
					enableIncludeCommentCheck(filePath) {
						return filePath.includes(path.join('@a-type', 'ui', 'dist'));
					},
				}),
				pluginReact(),
			],
			server: {
				port: getRandomPort(),
			},
			source: {
				entry: {
					index: path.join(import.meta.dirname, 'src', 'index.ts'),
				},
			},
		},
	});

	const { server, urls } = await rsbuild.startDevServer();

	await page.goto(urls[0]);

	await testProcedure(page);

	// await server.close();
});

test('should build and succeed', async ({ page }) => {
	let finalBuildCss = '';
	const rsbuild = await createRsbuild({
		cwd: import.meta.dirname,
		config: {
			plugins: [
				pluginUnoCss({
					logLevel: 'info',
					config: {
						presets: [presetAtype()],
						transformers: [transformerVariantGroup()],
						content: {
							pipeline: {
								include: [/\.(jsx|ts|tsx)($|\?)/],
							},
							filesystem: ['./src/unimported.ts'],
						},
					},
					enableIncludeCommentCheck(filePath) {
						return filePath.includes(path.join('@a-type', 'ui', 'dist'));
					},
					events: {
						onCssGenerated(result) {
							finalBuildCss = result.css;
						},
					},
				}),
				pluginReact(),
			],
			server: {
				port: getRandomPort(),
			},
			source: {
				entry: {
					index: path.join(import.meta.dirname, 'src', 'index.ts'),
				},
			},
		},
	});

	const result = await rsbuild.build();
	await result.close();

	// the final extracted CSS from the plugin events should
	// have library styles.
	expect(finalBuildCss).toBeTruthy();
	expect(finalBuildCss).toContain('my-0');

	// the actual file asset written to disk should, too
	const staticFilesDir = path.join(
		import.meta.dirname,
		'dist',
		'static',
		'css',
	);
	const files = await readdir(staticFilesDir);
	const cssFile = files.find((file) => file.endsWith('.css'));
	expect(cssFile).toBeTruthy();
	const cssContent = await readFile(
		path.join(staticFilesDir, cssFile!),
		'utf-8',
	);
	// look for any particular class I know is present in the imported @a-type/ui library
	expect(cssContent).toContain('my-0');
	// look for the filesystem dependency's class
	expect(cssContent).toContain('#created');

	// open the build in the browser to check applied styles
	const { server, urls } = await rsbuild.preview({
		getPortSilently: true,
	});
	await page.goto(urls[0]);

	await testProcedure(page);

	await server.close();
});
