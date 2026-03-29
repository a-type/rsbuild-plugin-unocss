import 'uno.css';
import './extraCss.css';

import { H2 } from '@a-type/ui';
import { ignoredClass } from './ignored';
import { importedClass } from './imported';

const testEl = document.createElement('button');
testEl.id = 'test-element';
testEl.classList.add('bg-[red]');
testEl.className = `bg-[red] focus:(bg-[blue] m-[8px]) ${importedClass}`;
// because the ignoredClass may be unintentionally included in the
// @a-type/ui library and compiled anyway, it includes a unique selector
// that uses this class.
testEl.classList.add('uniqueToThisTest');
testEl.classList.add(ignoredClass);
testEl.textContent = 'hello world';
document.getElementById('root')!.appendChild(testEl);

// just for usage's sake...
H2.displayName;
