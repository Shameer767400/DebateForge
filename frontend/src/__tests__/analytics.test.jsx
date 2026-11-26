import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent, trackPageView } from '../utils/analytics';
import SEOHead from '../components/SEOHead';

describe('GA4 analytics helpers & SEOHead', () => {
  let originalGtag;

  beforeEach(() => {
    originalGtag = window.gtag;
    delete window.__dfInitialPageViewTracked;
  });

  afterEach(() => {
    window.gtag = originalGtag;
    delete window.__dfInitialPageViewTracked;
  });

  it('no-ops safely when window.gtag is not defined', () => {
    delete window.gtag;
    expect(() => trackPageView('/pricing', 'Pricing | DebateForge')).not.toThrow();
    expect(() => trackEvent('purchase', { currency: 'INR', value: 49 })).not.toThrow();
  });

  it('forwards trackEvent and trackPageView to window.gtag', () => {
    const spy = vi.fn();
    window.gtag = spy;

    trackEvent('begin_checkout', { currency: 'INR', value: 999 });
    expect(spy).toHaveBeenCalledWith('event', 'begin_checkout', { currency: 'INR', value: 999 });

    trackPageView('/gd-topics', 'GD Topics | DebateForge');
    expect(spy).toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.objectContaining({
        page_path: '/gd-topics',
        page_title: 'GD Topics | DebateForge',
      })
    );
  });

  it('updates document title, canonical URL, and tracks subsequent SPA navigation in SEOHead', () => {
    const spy = vi.fn();
    window.gtag = spy;

    render(<SEOHead title="Pricing" description="Test pricing" path="/pricing" />);
    expect(document.title).toBe('Pricing | DebateForge');
    expect(document.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(
      'https://www.debateforge.tech/pricing'
    );
    // First mount skips duplicate page_view because gtag('config') already fires one
    expect(spy).not.toHaveBeenCalled();

    render(<SEOHead title="About" description="Test about" path="/about" />);
    expect(spy).toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.objectContaining({
        page_path: '/about',
        page_title: 'About | DebateForge',
      })
    );
  });
});
