import { useEffect } from 'react';

const defaults = {
  title: 'DebateForge — AI-Powered Debate Practice Platform',
  description:
    'Practice debates against AI opponents that adapt to your style. Get real-time fallacy detection, scoring, and analytics. Free to start.',
  url: 'https://www.debateforge.tech',
};

export default function SEOHead({ title, description, path = '/', noindex = false }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | DebateForge` : defaults.title;
    const desc = description || defaults.description;
    const canonicalUrl = `${defaults.url}${path}`;

    document.title = fullTitle;

    const setMeta = (attr, key, content) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);

    if (noindex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      const robotsMeta = document.querySelector('meta[name="robots"]');
      if (robotsMeta && robotsMeta.content.includes('noindex')) {
        robotsMeta.setAttribute('content', 'index, follow');
      }
    }

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    return () => {
      document.title = defaults.title;
    };
  }, [title, description, path, noindex]);

  return null;
}
