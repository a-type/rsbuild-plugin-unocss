import preset from '@a-type/ui/uno-preset';
import { defineConfig, transformerVariantGroup } from 'unocss';
import { primaryHue, saturation } from './configDep';
import { borderScale } from './configDepDirectory/otherDepMoved2';

export default defineConfig({
	content: {
		pipeline: {
			include: [/\.(jsx|ts|tsx)($|\?)/],
		},
		filesystem: ['./external/external.ts'],
	},
	presets: [
		preset({
			saturation: saturation,
			primaryHue: primaryHue,
			borderScale: borderScale,
		}),
	],
	transformers: [transformerVariantGroup()],
	configDeps: ['./configDep.ts', './configDepDirectory'],
});
