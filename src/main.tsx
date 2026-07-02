import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useI18n } from './lib/i18n';
import './styles/global.css';
import './styles/mobile.css';

// Apply the saved language to <html lang> before first paint.
document.documentElement.setAttribute('lang', useI18n.getState().lang);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
