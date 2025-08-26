import 'uno.css';
import { ignoredClass } from './ignored';
import { importedClass } from './imported';

const div = document.createElement('div');
div.id = 'test-element';
div.classList.add('bg-[red]');
div.className = `bg-[red] focus:(bg-[blue] m-[8px]) ${importedClass}`;
div.classList.add(ignoredClass);
div.textContent = 'hello world';
div.tabIndex = 0;
document.body.appendChild(div);
