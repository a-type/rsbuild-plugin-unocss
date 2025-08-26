import 'uno.css';

import { createRoot } from 'react-dom/client';
import { Component } from './Component';

// biome-ignore lint/style/noNonNullAssertion: its a test
createRoot(document.getElementById('root')!).render(<Component />);
