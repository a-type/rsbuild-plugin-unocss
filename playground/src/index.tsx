import { Box, Button, Provider } from '@a-type/ui';
import { pascalCase } from 'change-case';
import { createRoot } from 'react-dom/client';

import 'uno.css';

import './index.css';
import { ImportedComponent } from './ImportedComponent';
import { importedClass } from './imported.js';
import { jsClass } from './jsFile.js';

const container = document.createElement('div');
document.body.appendChild(container);
createRoot(container).render(
	<Provider>
		<Box
			col
			gap
			items="start"
			className="color-black md:(color-primary-ink bg-primary-wash) p-sm"
		>
			<h1 className={importedClass}>Rsbuild</h1>
			<p className={jsClass}>{pascalCase('Start building amazing things.')}</p>
			<Button>Library Component</Button>
			<ImportedComponent />
		</Box>
	</Provider>,
);
