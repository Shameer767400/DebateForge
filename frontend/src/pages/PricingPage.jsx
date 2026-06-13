/**
 * @fileoverview PricingPage — DebateForge SaaS Pricing
 *
 * 4-tier pricing:
 *   Free → Pro ($12/mo) → Institution ($299/mo) → Enterprise (custom)
 *
 * Integrates with Stripe Checkout via /api/billing/create-checkout-session
 *
 * @module pages/PricingPage
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';
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
    monthlyPrice: 12,
    yearlyPrice: 99,
    color: '#00ff87',
    accent: 'rgba(0, 255, 135, 0.12)',
    badge: 'Most Popular',
    cta: 'Start Pro',
    ctaAction: 'checkout',
    stripePriceId: {
      monthly: 'price_pro_monthly',   // replace with real Stripe price IDs
      yearly: 'price_pro_yearly',
    },
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
    monthlyPrice: 299,
    yearlyPrice: 2499,
    color: '#00aaff',
    accent: 'rgba(0, 170, 255, 0.12)',
    cta: 'Start Institution Trial',
    ctaAction: 'checkout',
    stripePriceId: {
      monthly: 'price_institution_monthly',
      yearly: 'price_institution_yearly',
    },
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
    a: 'Yes. Upgrades take effect immediately (prorated). Downgrades take effect at the next billing cycle.',
  },
  {
    q: 'What counts as a "debate" on the free tier?',
    a: 'Each debate session — regardless of length or number of rounds — counts as one debate. The free tier gives you 5 per month to try all core features.',
  },
  {
    q: 'How does Institution billing work?',
    a: 'You pay one flat fee for up to 50 seats. Users within your organization share that quota. Additional seats are available at $6/seat/month.',
  },
  {
    q: 'Do you offer discounts for students?',
    a: 'Yes — verified students get 50% off Pro with a .edu email. Contact us at students@debateforge.app.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'Institution plans include a 14-day free trial. Pro plans can be cancelled within 7 days for a full refund.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major credit cards, debit cards, UPI (India), and bank transfers for annual Enterprise plans.',
  },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const api = useApi();

  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'yearly'
  const [loading, setLoading] = useState(null);       // plan id being loaded
  const [openFaq, setOpenFaq] = useState(null);

  const handleCTA = async (plan) => {
    if (plan.ctaAction === 'register') {
      navigate(user ? '/lobby' : '/register');
      return;
    }

    if (plan.ctaAction === 'contact') {
      window.open('mailto:sales@debateforge.app?subject=Enterprise%20Inquiry%20—%20DebateForge', '_blank');
      return;
    }

    if (plan.ctaAction === 'checkout') {
      if (!user) {
        toast.info('Please sign in to upgrade your plan.');
        navigate('/login');
        return;
      }

      try {
        setLoading(plan.id);
        const priceId = plan.stripePriceId?.[billing];

        const { data } = await api.post('/api/billing/create-checkout-session', {
          priceId,
          planId: plan.id,
          billingCycle: billing,
        });

        // Redirect to Stripe Checkout
        if (data?.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned');
        }
      } catch (err) {
        console.error('[Pricing] Checkout error:', err);
        toast.error('Could not start checkout. Please try again or contact support.');
      } finally {
        setLoading(null);
      }
    }
  };

  const getPrice = (plan) => {
    if (plan.monthlyPrice === null) return 'Custom';
    if (plan.monthlyPrice === 0) return 'Free';
    const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    return `$${price}`;
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
      {/* ── HEADER ── */}
      <header className="pricing-header">
        <button className="pricing-back" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div className="pricing-hero">
          <div className="pricing-badge">Simple, Transparent Pricing</div>
          <h1 className="pricing-title">
            Invest in your <span className="pricing-accent">debate edge</span>
          </h1>
          <p className="pricing-subtitle">
            Start free. Scale when you're ready. No hidden fees, no contracts.
          </p>

          {/* Billing toggle */}
          <div className="pricing-toggle">
            <button
              className={`toggle-btn ${billing === 'monthly' ? 'toggle-btn--active' : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              className={`toggle-btn ${billing === 'yearly' ? 'toggle-btn--active' : ''}`}
              onClick={() => setBilling('yearly')}
            >
              Yearly
              <span className="toggle-save">Save up to 31%</span>
            </button>
          </div>
        </div>
      </header>

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
                      Save ${savings.savings}/year ({savings.pct}% off)
                    </div>
                  )}
                </div>

                <button
                  className="plan-cta"
                  style={{ background: plan.color }}
                  onClick={() => handleCTA(plan)}
                  disabled={isLoading}
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
        <div className="trust-label">Trusted by debaters at</div>
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
            onClick={() => window.open('mailto:sales@debateforge.app?subject=Enterprise%20Inquiry', '_blank')}
            id="pricing-contact-sales"
          >
            Talk to Sales →
          </button>
        </div>
      </section>
    </div>
  );
}
