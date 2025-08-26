// tests that filesystem extraction works. should not be included in bundle.
const neverRendered = document.createElement('div');
neverRendered.textContent = 'never rendered';
document.body.appendChild(neverRendered);

// this class is picked up and put in the bundle, though.
export const filesystemClass = 'absolute';
