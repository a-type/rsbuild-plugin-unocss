import { Box, Button, Provider } from '@a-type/ui';
import { pascalCase } from 'change-case';
import { createRoot } from 'react-dom/client';

import 'uno.css';
import './index.css';
import raw from 'uno.css?raw';
import { ImportedComponent } from './ImportedComponent';
import { ignoredClass } from './ignored.js';
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
			<pre className={ignoredClass}>${raw}</pre>
		</Box>
	</Provider>,
);
