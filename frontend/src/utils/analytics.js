/**
 * Safe Google Analytics 4 (GA4) tracking helpers.
 * No-ops gracefully when GA is not configured or blocked by the browser.
 */

export function trackPageView(pagePath, pageTitle) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', 'page_view', {
      page_path: pagePath || window.location.pathname + window.location.search,
      page_title: pageTitle || document.title,
      page_location: window.location.href,
    });
  } catch {
    /* ignore analytics errors */
  }
}

export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', eventName, params);
  } catch {
    /* ignore analytics errors */
  }
}
