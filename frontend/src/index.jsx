import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Automatically recover when a new deployment updates chunk hashes on the CDN
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const lastReload = sessionStorage.getItem('df_last_chunk_reload');
  const now = Date.now();
  // Throttle to one auto-reload per 30s to prevent infinite loops if user is offline
  if (!lastReload || now - parseInt(lastReload, 10) > 30000) {
    sessionStorage.setItem('df_last_chunk_reload', String(now));
    window.location.reload();
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
