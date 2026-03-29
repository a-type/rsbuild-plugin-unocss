import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './test',
	timeout: 10000,
	retries: 2,
	use: {
		trace: 'on-first-retry',
		headless: true,
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
