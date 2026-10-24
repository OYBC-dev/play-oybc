import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { applyTheme } from './theme';
import './styles/riso.css';
import './styles/app.css';

applyTheme(document, typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
