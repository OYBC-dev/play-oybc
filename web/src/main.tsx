import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { applyTheme } from './theme';
import './styles/riso.css';
import './styles/app.css';

applyTheme(document, window.matchMedia('(prefers-color-scheme: dark)'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
