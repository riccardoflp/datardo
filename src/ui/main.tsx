/**
 * The start of the window process: mirrors the app's state, then draws Datardo into the page.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import './theme/base.css';
import { App } from './app';
import { connectState } from './state/store';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('The page of the window has no root element.');
}
void connectState();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
