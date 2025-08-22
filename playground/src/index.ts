// import { pascalCase } from 'change-case';
import 'uno.css';
import './index.css';

// @ts-ignore
import raw from 'uno.css?raw';

document.querySelector('#root')!.innerHTML = `
<div class="color-white md:(color-black bg-orange) p-1 container">
  <h1>Vanilla Rsbuild</h1>
  <p>Start building amazing things.</p>
  <pre>
  ${raw}
  </pre>
</div>
`;
