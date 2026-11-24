import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Automatically recover when a new deployment updates chunk hashes on the CDN
const handleChunkError = (e) => {
  const reason = e?.reason?.message || e?.message || String(e || '');
  if (
    /Unable to preload CSS/i.test(reason) ||
    /Failed to fetch dynamically imported module/i.test(reason) ||
    /Loading chunk .* failed/i.test(reason)
  ) {
    if (e.preventDefault) e.preventDefault();
    const lastReload = sessionStorage.getItem('df_last_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 30000) {
      sessionStorage.setItem('df_last_chunk_reload', String(now));
      window.location.reload();
    }
  }
};

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  handleChunkError(event);
});

window.addEventListener('unhandledrejection', handleChunkError);


// Google Analytics 4 (GA4) auto-initialization when VITE_GA_MEASUREMENT_ID is configured
const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
if (gaMeasurementId && typeof window !== 'undefined') {
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', gaMeasurementId, { send_page_view: true });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
