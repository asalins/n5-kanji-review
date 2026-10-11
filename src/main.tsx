import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { applyKanjiFont, readKanjiFont } from './services/display/kanjiFont';

// The saved kanji font applies before the first render (no flash of another font choice).
applyKanjiFont(readKanjiFont());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
