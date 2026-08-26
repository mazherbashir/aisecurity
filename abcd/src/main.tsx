import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadConfig } from './config';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { safeStorage } from './lib/storage';

// Sanitize and prune any oversized or stale cached data on startup
safeStorage.sanitizeOnStartup();

loadConfig().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  );
});

