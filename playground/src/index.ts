import { pascalCase } from 'change-case';
import 'uno.css';
import './index.css';

// @ts-ignore
import raw from 'uno.css?raw';
import { jsClass } from './jsFile.js';

document.querySelector('#root')!.innerHTML = `
<div class="color-[white] md:(color-[black] bg-[#feb]) p-xs">
  <h1>Vanilla Rsbuild</h1>
  <p class="${jsClass}">${pascalCase('Start building amazing things.')}</p>
  <pre>
  ${raw}
  </pre>
</div>
`;
