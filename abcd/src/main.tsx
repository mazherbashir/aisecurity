import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadConfig } from './config';

// Prevent MetaMask browser extension noise from polluting console errors in this sandbox env
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const msg = args
      .map((arg) => (typeof arg === 'string' ? arg : (arg && arg.message) || ''))
      .join(' ');
    if (msg.toLowerCase().includes('metamask')) {
      return; // Filter out MetaMask connection failure warnings
    }
    originalError.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    if (event.message && event.message.toLowerCase().includes('metamask')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason && (reason.message || String(reason));
    if (msg && msg.toLowerCase().includes('metamask')) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

loadConfig().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
