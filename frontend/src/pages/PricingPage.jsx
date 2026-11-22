/**
 * @fileoverview PricingPage — DebateForge SaaS Pricing
 *
 * 4-tier pricing (INR):
 *   Free (₹0) → Pro (₹999/mo) → Institution (₹24,999/mo) → Enterprise (Custom)
 *
 * Integrates with Razorpay Checkout via /api/billing/create-order & /api/billing/verify-payment
 * Supports UPI, Credit/Debit Cards, Net Banking, and Wallets.
 *
 * @module pages/PricingPage
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/pricing.css';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Get started, no card needed',
    monthlyPrice: 0,
    yearlyPrice: 0,
    color: 'var(--text-secondary)',
    accent: 'rgba(255,255,255,0.15)',
    cta: 'Start Free',
    ctaAction: 'register',
    features: [
      { text: '5 AI debates per month', included: true },
      { text: 'Basic scoring (logic, evidence, clarity)', included: true },
      { text: 'Leaderboard access', included: true },
      { text: 'Fallacy detection', included: true },
      { text: 'Unlimited debates', included: false },
      { text: 'ElevenLabs TTS voices', included: false },
      { text: 'PDF report cards', included: false },
      { text: 'Score history & analytics', included: false },
      { text: 'Institution dashboard', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For serious individual debaters',
    monthlyPrice: 999,
    yearlyPrice: 7999,
    color: '#00ff87',
    accent: 'rgba(0, 255, 135, 0.12)',
    badge: 'Most Popular',
    cta: 'Upgrade to Pro',
    ctaAction: 'checkout',
    features: [
      { text: 'Unlimited AI debates', included: true },
      { text: 'All debate formats (Oxford, LD, Parliamentary)', included: true },
      { text: 'ElevenLabs premium voices', included: true },
      { text: 'Full PDF report cards', included: true },
      { text: 'Score history & trend analytics', included: true },
      { text: 'Priority AI queue', included: true },
      { text: 'All 10 Indian languages', included: true },
      { text: 'Custom AI personas', included: true },
      { text: 'Institution dashboard', included: false },
    ],
  },
  {
    id: 'institution',
    name: 'Institution',
    tagline: 'For schools, coaching institutes & clubs',
    monthlyPrice: 24999,
    yearlyPrice: 199999,
    color: '#00aaff',
    accent: 'rgba(0, 170, 255, 0.12)',
    cta: 'Get Institution Plan',
    ctaAction: 'checkout',
    features: [
      { text: 'Everything in Pro (up to 50 seats)', included: true },
      { text: 'Organization admin dashboard', included: true },
      { text: 'Student progress reports', included: true },
      { text: 'Custom topic libraries', included: true },
      { text: 'Tournament mode (student vs student)', included: true },
      { text: 'Bulk user management', included: true },
      { text: 'CSV export for reports', included: true },
      { text: 'Priority email support', included: true },
      { text: 'SSO (Google Workspace / Azure AD)', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For universities, law firms & corporates',
    monthlyPrice: null,
    yearlyPrice: null,
    color: '#ffcc00',
    accent: 'rgba(255, 204, 0, 0.10)',
    cta: 'Contact Sales',
    ctaAction: 'contact',
    features: [
      { text: 'Everything in Institution (unlimited seats)', included: true },
      { text: 'SSO (SAML, Google, Microsoft)', included: true },
      { text: 'LMS integration (Moodle, Canvas, Blackboard)', included: true },
      { text: 'White-label option', included: true },
      { text: 'Custom AI debate personas', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'SLA guarantee (99.9% uptime)', included: true },
      { text: 'On-premise deployment option', included: true },
      { text: 'Custom analytics & reporting API', included: true },
    ],
  },
];

const FAQ = [
  {
    q: 'Can I switch plans anytime?',
    a: 'Yes. Upgrades take effect immediately. Downgrades take effect at the end of your current active billing cycle.',
  },
  {
    q: 'What counts as a "debate" on the free tier?',
    a: 'Each debate session — regardless of length or number of rounds — counts as one debate. The free tier gives you 5 per month to try all core features.',
  },
  {
    q: 'How does Institution billing work?',
    a: 'You pay one flat fee for up to 50 seats. Users within your organization share that quota. Additional seats are available upon request.',
  },
  {
    q: 'Do you offer discounts for students?',
    a: 'Yes — verified students get special discounts with a valid student ID or educational email. Contact us at support@debateforge.tech.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept UPI (Google Pay, PhonePe, Paytm, BHIM), all major Credit & Debit cards (Visa, Mastercard, RuPay), Net Banking across 50+ banks, and Wallets via Razorpay.',
  },
  {
    q: 'Is payment secure?',
    a: 'Yes. All payments are encrypted and processed securely by Razorpay, a PCI-DSS Level 1 compliant payment gateway. DebateForge never stores your card or banking credentials.',
  },
];

/**
 * Detect if the page is opened inside a social media in-app WebView
 * (Instagram, Facebook, WhatsApp, Twitter/X, LinkedIn)
 */
function detectInAppBrowser() {
  if (typeof navigator === 'undefined') return { isInApp: false, isAndroid: false, isIOS: false };
  const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
  const isInApp = /instagram|fban|fbav|twitter|linkedinapp|whatsapp|snapchat|line\//i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  return { isInApp, isAndroid, isIOS };
}

/**
 * Dynamically load Razorpay Checkout script if not already on window
 */
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('[Razorpay] Failed to load checkout script');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, refreshSession } = useAuth();
  const toast = useToast();
  const api = useApi();

  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'yearly'
  const [loading, setLoading] = useState(null);       // plan id currently processing
  const [openFaq, setOpenFaq] = useState(null);
  const [inAppInfo] = useState(() => detectInAppBrowser());
  const [dismissInAppNotice, setDismissInAppNotice] = useState(false);

  const handleOpenExternal = () => {
    if (typeof window === 'undefined') return;
    const currentUrl = window.location.href;
    if (inAppInfo.isAndroid) {
      const cleanUrl = currentUrl.replace(/^https?:\/\//, '');
      window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
    } else {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(currentUrl);
        toast.info('Link copied! Open Safari and paste to pay with Google Pay or PhonePe.');
      } else {
        toast.info('Tap ··· at the top right and select "Open in Safari" to pay with UPI.');
      }
    }
  };

  const handleCTA = async (plan) => {
    if (plan.ctaAction === 'register') {
      navigate(user ? '/lobby' : '/register');
      return;
    }

    if (plan.ctaAction === 'contact') {
      window.open('mailto:sales@debateforge.tech?subject=Enterprise%20Inquiry%20—%20DebateForge', '_blank');
      return;
    }

    if (plan.ctaAction === 'checkout') {
      if (!user) {
        toast.info('Please sign in or create an account to upgrade your plan.');
        navigate('/login', { state: { from: '/pricing' } });
        return;
      }

      try {
        setLoading(plan.id);

        // 1. Ensure Razorpay SDK script is loaded
        const isLoaded = await loadRazorpayScript();
        if (!isLoaded) {
          toast.error('Unable to load payment gateway. Please check your internet connection.');
          setLoading(null);
          return;
        }

        // 2. Create Razorpay order on backend
        const { data: orderData } = await api.post('/api/billing/create-order', {
          planId: plan.id,
          billingCycle: billing,
        });

        if (!orderData?.orderId || !orderData?.keyId) {
          throw new Error('Invalid order response from payment service');
        }

        // 3. Configure Razorpay modal options
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'DebateForge',
          description: orderData.description || `${plan.name} (${billing}) Subscription`,
          order_id: orderData.orderId,
          prefill: {
            name: orderData.prefill?.name || user.username || '',
            email: orderData.prefill?.email || user.email || '',
            contact: orderData.prefill?.contact || user.phone || user.contact || '',
          },
          theme: {
            color: plan.color || '#00ff87',
          },
          modal: {
            ondismiss: () => {
              toast.info('Payment window closed.');
              setLoading(null);
            },
          },
          handler: async (response) => {
            try {
              toast.info('Verifying payment with bank…');

              // 4. Verify payment on server
              const verifyRes = await api.post('/api/billing/verify-payment', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planId: plan.id,
                billingCycle: billing,
              });

              if (verifyRes.data?.success) {
                toast.success(`🎉 Payment verified! Welcome to ${plan.name}!`);
                if (refreshSession) {
                  try { await refreshSession(); } catch { /* ignore */ }
                }
                navigate('/dashboard?upgraded=true&plan=' + plan.id);
              } else {
                toast.error(verifyRes.data?.error || 'Payment verification failed');
              }
            } catch (vErr) {
              console.error('[Pricing] Verification error:', vErr);
              toast.error(vErr.response?.data?.error || 'Payment verification failed. Please contact support.');
            } finally {
              setLoading(null);
            }
          },
        };

        const rzp = new window.Razorpay(options);

        rzp.on('payment.failed', (errResponse) => {
          console.error('[Pricing] Razorpay payment failure:', errResponse.error);
          toast.error(errResponse.error?.description || 'Payment failed. Please try another payment method.');
          setLoading(null);
        });

        rzp.open();
      } catch (err) {
        console.error('[Pricing] Checkout error:', err);
        const errMsg = err.response?.data?.error || err.message || 'Could not start payment. Please try again.';
        toast.error(errMsg);
        setLoading(null);
      }
    }
  };

  const getPrice = (plan) => {
    if (plan.monthlyPrice === null) return 'Custom';
    if (plan.monthlyPrice === 0) return 'Free';
    const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    return `₹${price.toLocaleString('en-IN')}`;
  };

  const getPeriodLabel = (plan) => {
    if (plan.monthlyPrice === null || plan.monthlyPrice === 0) return '';
    return billing === 'yearly' ? '/year' : '/month';
  };

  const getSavings = (plan) => {
    if (!plan.monthlyPrice || !plan.yearlyPrice) return null;
    const annualIfMonthly = plan.monthlyPrice * 12;
    const savings = annualIfMonthly - plan.yearlyPrice;
    const pct = Math.round((savings / annualIfMonthly) * 100);
    return { savings, pct };
  };

  return (
    <div className="pricing-page">
      <SEOHead
        title="Pricing - DebateForge"
        description="Simple, transparent pricing for DebateForge. Start free, upgrade to Pro for advanced AI coaching, analytics, and unlimited debates via UPI and cards."
        path="/pricing"
      />
      {/* ── HEADER ── */}
      <header className="pricing-header">
        <button className="pricing-back" onClick={() => navigate(user ? '/dashboard' : '/')}>
          ← Back
        </button>
        <div className="pricing-hero">
          <div className="pricing-badge">Simple, Transparent Pricing</div>
          <h1 className="pricing-title">
            Invest in your <span className="pricing-accent">debate edge</span>
          </h1>
          <p className="pricing-subtitle">
            Start free. Scale when you're ready. Pay securely with UPI, Cards, or Net Banking.
          </p>

          {/* Billing toggle */}
          <div className="pricing-toggle">
            <button
              type="button"
              className={`pricing-toggle-btn ${billing === 'monthly' ? 'pricing-toggle-btn--active' : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`pricing-toggle-btn ${billing === 'yearly' ? 'pricing-toggle-btn--active' : ''}`}
              onClick={() => setBilling('yearly')}
            >
              Yearly
              <span className="pricing-toggle-save">Save ~33%</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── IN-APP BROWSER NOTICE (Instagram / WhatsApp / FB) ── */}
      {inAppInfo.isInApp && !dismissInAppNotice && (
        <div className="in-app-browser-banner" role="alert">
          <div className="in-app-banner-icon">📱</div>
          <div className="in-app-banner-content">
            <div className="in-app-banner-title">
              Paying via Google Pay, PhonePe, or Paytm?
            </div>
            <div className="in-app-banner-desc">
              Social media in-app browsers block direct UPI app switching. Open this page in{' '}
              <strong>{inAppInfo.isAndroid ? 'Chrome' : 'Safari'}</strong> for instant 1-tap UPI payment.
            </div>
            {inAppInfo.isIOS && (
              <div className="in-app-banner-ios-hint">
                👉 Tap <strong>···</strong> at the top right &amp; choose <strong>"Open in Safari"</strong>.
              </div>
            )}
          </div>
          <div className="in-app-banner-actions">
            {inAppInfo.isAndroid ? (
              <a
                href={`intent://${typeof window !== 'undefined' ? window.location.host + window.location.pathname + window.location.search : 'www.debateforge.tech/pricing'}#Intent;scheme=https;package=com.android.chrome;end`}
                className="in-app-banner-btn in-app-banner-btn--primary"
              >
                Open in Chrome
              </a>
            ) : (
              <button
                type="button"
                className="in-app-banner-btn in-app-banner-btn--primary"
                onClick={handleOpenExternal}
              >
                Copy Link for Safari
              </button>
            )}
            <button
              type="button"
              className="in-app-banner-close"
              onClick={() => setDismissInAppNotice(true)}
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── PLAN GRID ── */}
      <section className="pricing-grid-section">
        <div className="pricing-grid">
          {PLANS.map((plan) => {
            const savings = getSavings(plan);
            const isLoading = loading === plan.id;

            return (
              <div
                key={plan.id}
                className={`pricing-card ${plan.badge ? 'pricing-card--featured' : ''}`}
                style={{ '--plan-color': plan.color, '--plan-accent': plan.accent }}
              >
                {plan.badge && (
                  <div className="pricing-badge-pill">{plan.badge}</div>
                )}

                <div className="plan-header">
                  <div className="plan-name" style={{ color: plan.color }}>{plan.name}</div>
                  <div className="plan-tagline">{plan.tagline}</div>
                  <div className="plan-price-row">
                    <span className="plan-price">{getPrice(plan)}</span>
                    <span className="plan-period">{getPeriodLabel(plan)}</span>
                  </div>
                  {billing === 'yearly' && savings && (
                    <div className="plan-savings">
                      Save ₹{savings.savings.toLocaleString('en-IN')}/year ({savings.pct}% off)
                    </div>
                  )}
                </div>

                <button
                  className="plan-cta"
                  style={{ background: plan.color }}
                  onClick={() => handleCTA(plan)}
                  disabled={Boolean(isLoading)}
                  id={`pricing-cta-${plan.id}`}
                >
                  {isLoading ? (
                    <span className="cta-spinner" />
                  ) : (
                    plan.cta
                  )}
                </button>

                <ul className="plan-features">
                  {plan.features.map((f, i) => (
                    <li
                      key={i}
                      className={`plan-feature ${f.included ? 'plan-feature--yes' : 'plan-feature--no'}`}
                    >
                      <span className="feature-check">
                        {f.included ? '✓' : '✗'}
                      </span>
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── INSTITUTION TRUST STRIP ── */}
      <section className="pricing-trust">
        <div className="trust-label">Trusted by debaters and teams at</div>
        <div className="trust-logos">
          {['Debate Clubs', 'Coaching Institutes', 'Law Schools', 'Corporates', 'High Schools'].map((org) => (
            <div key={org} className="trust-pill">{org}</div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="pricing-faq">
        <h2 className="faq-title">Frequently Asked Questions</h2>
        <div className="faq-list">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className={`faq-item ${openFaq === i ? 'faq-item--open' : ''}`}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="faq-question">
                <span>{item.q}</span>
                <span className="faq-chevron">{openFaq === i ? '−' : '+'}</span>
              </div>
              {openFaq === i && (
                <div className="faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── ENTERPRISE CTA ── */}
      <section className="pricing-enterprise-cta">
        <div className="enterprise-cta-content">
          <h2 className="enterprise-cta-title">Need a custom solution?</h2>
          <p className="enterprise-cta-sub">
            Large universities, law firms, and corporate L&D teams get custom pricing, dedicated support, and SSO.
          </p>
          <button
            className="enterprise-cta-btn"
            onClick={() => window.open('mailto:sales@debateforge.tech?subject=Enterprise%20Inquiry', '_blank')}
            id="pricing-contact-sales"
          >
            Talk to Sales →
          </button>
        </div>
      </section>
    </div>
  );
}
