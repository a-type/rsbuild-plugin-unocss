import 'uno.css';

(window as any).test = 1;

const testElement = document.createElement('div');
testElement.id = 'test-element';
testElement.classList.add('m-[8px]');
testElement.classList.add('bg-[red]');
testElement.textContent = 'hello world';
document.body.appendChild(testElement);
